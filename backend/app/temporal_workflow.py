from __future__ import annotations

import json
import re
from datetime import timedelta
from typing import Any, Dict, List, Optional

from temporalio import workflow
from temporalio.common import RetryPolicy

MARK_RUN_RUNNING_ACTIVITY = "mark_run_running"
APPEND_RUN_LOG_ACTIVITY = "append_run_log"
MARK_RUN_COMPLETED_ACTIVITY = "mark_run_completed"
MARK_RUN_FAILED_ACTIVITY = "mark_run_failed"
PERFORM_API_CALL_ACTIVITY = "perform_api_call"
DEFAULT_API_REQUEST_TIMEOUT_SECONDS = 30

SUPPORTED_OPERATORS = {
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "contains",
    "not_contains",
    "in",
    "not_in",
    "is_null",
    "is_not_null",
}
TEMPLATE_PATTERN = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")


def _stringify_output(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, default=str)


def normalize_json_path(path: str) -> str:
    return (
        path.strip()
        .replace("$.", "")
        .replace("$", "")
        .replace("[", ".")
        .replace("]", "")
        .replace("..", ".")
        .strip(".")
    )


def get_value_from_path(payload: Any, path: str) -> Any:
    normalized_path = normalize_json_path(path)

    if not normalized_path:
        return payload

    current = payload
    for segment in normalized_path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(segment)
    return current


def coerce_expected_value(value: str) -> Any:
    trimmed = value.strip()

    if trimmed == "":
        return ""
    if len(trimmed) >= 2 and trimmed[0] == trimmed[-1] == "'":
        return trimmed[1:-1]
    if trimmed == "true":
        return True
    if trimmed == "false":
        return False
    if trimmed == "null":
        return None

    try:
        as_number = float(trimmed)
    except ValueError:
        as_number = None

    if as_number is not None:
        if "." not in trimmed and "e" not in trimmed.lower():
            return int(as_number)
        return as_number

    try:
        return json.loads(trimmed)
    except json.JSONDecodeError:
        return trimmed


def _parse_condition_literal(value: str) -> tuple[bool, Any]:
    trimmed = value.strip()

    if trimmed == "":
        return False, None

    if len(trimmed) >= 2 and trimmed[0] == trimmed[-1] == "'":
        return True, trimmed[1:-1]

    try:
        return True, json.loads(trimmed)
    except json.JSONDecodeError:
        return False, None


def _coerce_number(value: Any) -> Optional[float]:
    if value is None:
        return None

    if isinstance(value, bool):
        return float(int(value))

    if isinstance(value, (int, float)):
        return float(value)

    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def _coerce_membership_values(expected: Any, raw_expected_value: str) -> List[Any]:
    if isinstance(expected, list):
        return expected

    values: List[Any] = []
    for item in str(raw_expected_value).split(","):
        trimmed = item.strip()
        if trimmed:
            values.append(coerce_expected_value(trimmed))

    return values


def compare_values(actual: Any, operator: str, raw_expected_value: str) -> bool:
    expected = coerce_expected_value(raw_expected_value)

    if operator == "eq":
        return actual == expected
    if operator == "neq":
        return actual != expected
    if operator == "gt":
        actual_number = _coerce_number(actual)
        expected_number = _coerce_number(expected)
        return (
            actual_number is not None
            and expected_number is not None
            and actual_number > expected_number
        )
    if operator == "gte":
        actual_number = _coerce_number(actual)
        expected_number = _coerce_number(expected)
        return (
            actual_number is not None
            and expected_number is not None
            and actual_number >= expected_number
        )
    if operator == "lt":
        actual_number = _coerce_number(actual)
        expected_number = _coerce_number(expected)
        return (
            actual_number is not None
            and expected_number is not None
            and actual_number < expected_number
        )
    if operator == "lte":
        actual_number = _coerce_number(actual)
        expected_number = _coerce_number(expected)
        return (
            actual_number is not None
            and expected_number is not None
            and actual_number <= expected_number
        )
    if operator == "contains":
        if isinstance(actual, list):
            return expected in actual
        return str(expected) in str(actual or "")
    if operator == "not_contains":
        if isinstance(actual, list):
            return expected not in actual
        return str(expected) not in str(actual or "")
    if operator == "in":
        return actual in _coerce_membership_values(expected, raw_expected_value)
    if operator == "not_in":
        return actual not in _coerce_membership_values(expected, raw_expected_value)
    if operator == "is_null":
        return actual is None
    if operator == "is_not_null":
        return actual is not None
    return True


def get_condition_value(current_payload: Any, original_input: Any, field: str) -> Any:
    normalized_field = field.strip()

    if not normalized_field:
        return current_payload

    literal_match, literal_value = _parse_condition_literal(normalized_field)
    if literal_match:
        return literal_value

    if normalized_field.startswith("input."):
        return get_value_from_path(original_input, normalized_field.replace("input.", "", 1))
    if normalized_field.startswith("current."):
        return get_value_from_path(current_payload, normalized_field.replace("current.", "", 1))
    if normalized_field.startswith("output."):
        return get_value_from_path(current_payload, normalized_field.replace("output.", "", 1))
    return get_value_from_path(current_payload, normalized_field)


def evaluate_condition_groups(
    condition_groups: List[Dict[str, Any]], current_payload: Any, original_input: Any
) -> bool:
    if not condition_groups:
        return True

    for group in condition_groups:
        conditions = group.get("conditions", []) if isinstance(group, dict) else []

        if not conditions:
            continue

        valid_conditions = [condition for condition in conditions if isinstance(condition, dict)]
        if not valid_conditions:
            continue

        if all(
            compare_values(
                get_condition_value(current_payload, original_input, str(condition.get("field", ""))),
                str(condition.get("operator", "eq")),
                str(condition.get("value", "")),
            )
            for condition in valid_conditions
        ):
            return True

    return False


def render_template_string(template: str, current_payload: Any, original_input: Any) -> str:
    def replace(match: re.Match[str]) -> str:
        expression = match.group(1).strip()

        if expression.startswith("input."):
            value = get_value_from_path(original_input, expression.replace("input.", "", 1))
        elif expression.startswith("current."):
            value = get_value_from_path(current_payload, expression.replace("current.", "", 1))
        elif expression.startswith("output."):
            value = get_value_from_path(current_payload, expression.replace("output.", "", 1))
        else:
            value = get_value_from_path(current_payload, expression)

        if value is None:
            return ""
        if isinstance(value, (dict, list)):
            return json.dumps(value)
        return str(value)

    return TEMPLATE_PATTERN.sub(replace, template)


def resolve_final_output(current_payload: Any, original_input: Any, expression: str) -> Any:
    if not expression.strip():
        return current_payload

    if expression.startswith("input."):
        extracted = get_value_from_path(original_input, expression.replace("input.", "", 1))
    else:
        extracted = get_value_from_path(current_payload, expression)

    if extracted is None:
        return current_payload

    return extracted


def build_wait_seconds(amount: Any, unit: Any) -> int:
    amount_value = int(float(amount or 0))
    unit_value = str(unit or "minutes")
    unit_map = {
        "seconds": 1,
        "minutes": 60,
        "hours": 3600,
        "days": 86400,
    }
    return max(1, amount_value) * unit_map.get(unit_value, 60)


@workflow.defn
class FlowExecutionWorkflow:
    @workflow.run
    async def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        run_id = str(payload["run_id"])
        definition = payload.get("definition", {})
        nodes = definition.get("nodes", {}) if isinstance(definition, dict) else {}
        current_node_id = definition.get("startAt") if isinstance(definition, dict) else None
        current_payload = payload.get("input_payload", {})
        original_input = payload.get("input_payload", {})
        default_api_timeout_seconds = int(
            payload.get("default_api_timeout_seconds") or DEFAULT_API_REQUEST_TIMEOUT_SECONDS
        )
        nodes_completed = 0
        sort_order = 0
        run_finished = False

        await workflow.execute_activity(
            MARK_RUN_RUNNING_ACTIVITY,
            run_id,
            start_to_close_timeout=timedelta(seconds=30),
        )

        try:
            while current_node_id:
                node = nodes.get(current_node_id)
                if not node:
                    raise RuntimeError("Normalized workflow references a missing node: {0}".format(current_node_id))

                node_started_at = workflow.now()
                node_type = str(node.get("node_type", "end"))
                node_label = str(node.get("label", node.get("id", current_node_id)))
                output = ""
                error_message = None
                next_node_id = None
                status = "completed"

                if node.get("type") == "trigger":
                    output = "Trigger fired"
                    next_node_id = node.get("next_node")
                elif node.get("type") == "decision":
                    condition_groups = node.get("config", {}).get("conditionGroups", [])
                    branch = (
                        "true"
                        if evaluate_condition_groups(condition_groups, current_payload, original_input)
                        else "false"
                    )
                    output = "Branch -> {0}".format(branch.upper())
                    next_node_id = node.get("next_nodes", {}).get(branch)
                elif node.get("action_name") == "wait":
                    wait_seconds = build_wait_seconds(
                        node.get("config", {}).get("amount"),
                        node.get("config", {}).get("unit"),
                    )
                    await workflow.sleep(timedelta(seconds=wait_seconds))
                    output = "Wait complete"
                    next_node_id = node.get("next_node")
                elif node.get("action_name") == "api_call":
                    api_timeout_seconds = int(
                        node.get("config", {}).get("timeout") or default_api_timeout_seconds
                    )
                    api_result = await workflow.execute_activity(
                        PERFORM_API_CALL_ACTIVITY,
                        {
                            "config": node.get("config", {}),
                            "current_payload": current_payload,
                            "original_input": original_input,
                        },
                        result_type=dict,
                        start_to_close_timeout=timedelta(seconds=api_timeout_seconds + 5),
                        retry_policy=RetryPolicy(maximum_attempts=1),
                    )

                    if not api_result.get("ok"):
                        status = "failed"
                        error_message = str(api_result.get("error") or "API call failed.")
                        output = _stringify_output(api_result)
                    else:
                        current_payload = api_result
                        output = _stringify_output(api_result)
                        next_node_id = node.get("next_node")
                elif node.get("action_name") == "end_workflow":
                    current_payload = resolve_final_output(
                        current_payload,
                        original_input,
                        str(node.get("config", {}).get("outputExpression", "")),
                    )
                    output = "Workflow reached end node"
                    next_node_id = None
                else:
                    output = "Node completed"
                    next_node_id = node.get("next_node")

                node_completed_at = workflow.now()
                duration_ms = int((node_completed_at - node_started_at).total_seconds() * 1000)
                nodes_completed += 1

                await workflow.execute_activity(
                    APPEND_RUN_LOG_ACTIVITY,
                    {
                        "run_id": run_id,
                        "node_id": str(node.get("id", current_node_id)),
                        "node_type": node_type,
                        "node_label": node_label,
                        "status": status,
                        "sort_order": sort_order,
                        "output": output,
                        "error": error_message,
                        "started_at": node_started_at.isoformat(),
                        "completed_at": node_completed_at.isoformat(),
                        "duration_ms": duration_ms,
                        "nodes_completed": nodes_completed,
                    },
                    start_to_close_timeout=timedelta(seconds=30),
                )
                sort_order += 1

                if status == "failed":
                    await workflow.execute_activity(
                        MARK_RUN_FAILED_ACTIVITY,
                        {
                            "run_id": run_id,
                            "error_message": error_message or "Workflow failed.",
                            "nodes_completed": nodes_completed,
                        },
                        start_to_close_timeout=timedelta(seconds=30),
                    )
                    run_finished = True
                    raise RuntimeError(error_message or "Workflow failed.")

                if node.get("action_name") == "end_workflow":
                    await workflow.execute_activity(
                        MARK_RUN_COMPLETED_ACTIVITY,
                        {
                            "run_id": run_id,
                            "final_output": current_payload,
                            "nodes_completed": nodes_completed,
                        },
                        start_to_close_timeout=timedelta(seconds=30),
                    )
                    run_finished = True
                    return {
                        "status": "completed",
                        "final_output": current_payload,
                    }

                current_node_id = next_node_id

            await workflow.execute_activity(
                MARK_RUN_COMPLETED_ACTIVITY,
                {
                    "run_id": run_id,
                    "final_output": current_payload,
                    "nodes_completed": nodes_completed,
                },
                start_to_close_timeout=timedelta(seconds=30),
            )
            run_finished = True
            return {
                "status": "completed",
                "final_output": current_payload,
            }
        except Exception as error:
            if not run_finished:
                await workflow.execute_activity(
                    MARK_RUN_FAILED_ACTIVITY,
                    {
                        "run_id": run_id,
                        "error_message": str(error),
                        "nodes_completed": nodes_completed,
                    },
                    start_to_close_timeout=timedelta(seconds=30),
                )
            raise
