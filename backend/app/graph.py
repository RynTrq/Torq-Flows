from __future__ import annotations

import json
import re
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from .models import (
    NormalizedWorkflowDefinition,
    NormalizedWorkflowNode,
    TriggerType,
    ValidationIssue,
    WorkflowEdgeDefinition,
    WorkflowNodeDefinition,
    WorkflowStatus,
)

NODE_LABELS: Dict[str, str] = {
    "manual_trigger": "Manual Trigger",
    "webhook_trigger": "Webhook Trigger",
    "decision": "Decision",
    "wait": "Wait",
    "api_call": "API Call",
    "end": "End",
}

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


class WorkflowValidationException(ValueError):
    def __init__(self, message: str, issues: List[ValidationIssue]) -> None:
        super().__init__(message)
        self.issues = issues


def _coerce_json_candidate(raw: str) -> Optional[Any]:
    candidate = TEMPLATE_PATTERN.sub("__template__", raw)

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def _outgoing_edges(
    edges: List[WorkflowEdgeDefinition], source_id: str
) -> List[WorkflowEdgeDefinition]:
    return [edge for edge in edges if edge.source == source_id]


def _incoming_edges(
    edges: List[WorkflowEdgeDefinition], target_id: str
) -> List[WorkflowEdgeDefinition]:
    return [edge for edge in edges if edge.target == target_id]


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


def get_condition_value(current_payload: Any, original_input: Any, field: str) -> Any:
    normalized_field = field.strip()

    if not normalized_field:
        return current_payload

    if normalized_field.startswith("input."):
        return get_value_from_path(original_input, normalized_field.replace("input.", "", 1))

    if normalized_field.startswith("current."):
        return get_value_from_path(current_payload, normalized_field.replace("current.", "", 1))

    if normalized_field.startswith("output."):
        return get_value_from_path(current_payload, normalized_field.replace("output.", "", 1))

    return get_value_from_path(current_payload, normalized_field)


def coerce_expected_value(value: str) -> Any:
    trimmed = value.strip()

    if trimmed == "":
        return ""
    if trimmed == "true":
        return True
    if trimmed == "false":
        return False
    if trimmed == "null":
        return None

    as_number = None
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
        values = _coerce_membership_values(expected, raw_expected_value)
        return actual in values
    if operator == "not_in":
        values = _coerce_membership_values(expected, raw_expected_value)
        return actual not in values
    if operator == "is_null":
        return actual is None
    if operator == "is_not_null":
        return actual is not None
    return True


def evaluate_condition_groups(
    condition_groups: List[Dict[str, Any]], current_payload: Any, original_input: Any
) -> bool:
    if not condition_groups:
        return True

    for group in condition_groups:
        conditions = group.get("conditions", []) if isinstance(group, dict) else []

        if not conditions:
            continue

        if all(
            compare_values(
                get_condition_value(current_payload, original_input, str(condition.get("field", ""))),
                str(condition.get("operator", "eq")),
                str(condition.get("value", "")),
            )
            for condition in conditions
            if isinstance(condition, dict)
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


def build_workflow_description(workflow_name: str, trigger_type: TriggerType, node_count: int) -> str:
    if node_count == 0:
        return "{0} has not been configured yet".format(workflow_name)

    trigger_label = "Webhook-triggered" if trigger_type == "webhook" else "Manually triggered"
    plural = "" if node_count == 1 else "s"
    return "{0} workflow with {1} node{2}".format(trigger_label, node_count, plural)


def _build_cycle_issues(cycle_nodes: List[str]) -> List[ValidationIssue]:
    unique_nodes: List[str] = []

    for node_id in cycle_nodes:
        if node_id not in unique_nodes:
            unique_nodes.append(node_id)

    if not unique_nodes:
        return []

    message = "Workflow contains a cycle. Remove the circular connection before saving."
    return [
        ValidationIssue(nodeId=node_id, severity="error", code="cycle_detected", message=message)
        for node_id in unique_nodes
    ]


def validate_workflow_graph(
    nodes: List[WorkflowNodeDefinition], edges: List[WorkflowEdgeDefinition]
) -> List[ValidationIssue]:
    issues: List[ValidationIssue] = []
    node_map: Dict[str, WorkflowNodeDefinition] = {node.id: node for node in nodes}
    trigger_nodes = [node for node in nodes if node.nodeType in ("manual_trigger", "webhook_trigger")]
    end_nodes = [node for node in nodes if node.nodeType == "end"]

    if not trigger_nodes:
        issues.append(
            ValidationIssue(
                severity="error",
                code="missing_trigger",
                message="Workflow must contain exactly one trigger node.",
            )
        )
    elif len(trigger_nodes) > 1:
        issues.append(
            ValidationIssue(
                severity="error",
                code="multiple_triggers",
                message="Workflow cannot contain more than one trigger node.",
            )
        )

    if not end_nodes:
        issues.append(
            ValidationIssue(
                severity="error",
                code="missing_end",
                message="Workflow must contain at least one end node.",
            )
        )

    for edge in edges:
        if edge.source not in node_map:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="missing_edge_source",
                    message="An edge references a missing source node.",
                )
            )
        if edge.target not in node_map:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="missing_edge_target",
                    message="An edge references a missing target node.",
                )
            )

    for node in nodes:
        outgoing = _outgoing_edges(edges, node.id)
        incoming = _incoming_edges(edges, node.id)
        config = node.config or {}

        if node.nodeType in ("manual_trigger", "webhook_trigger") and incoming:
            issues.append(
                ValidationIssue(
                    nodeId=node.id,
                    severity="error",
                    code="trigger_has_incoming",
                    message='Trigger nodes cannot have incoming connections.',
                )
            )

        if node.nodeType == "decision":
            true_edges = [edge for edge in outgoing if edge.sourceHandle == "true"]
            false_edges = [edge for edge in outgoing if edge.sourceHandle == "false"]
            unlabeled_edges = [edge for edge in outgoing if edge.sourceHandle not in ("true", "false")]

            if len(true_edges) != 1:
                issues.append(
                    ValidationIssue(
                        nodeId=node.id,
                        severity="error",
                        code="decision_true_branch",
                        message='Decision nodes must have exactly one TRUE branch.',
                    )
                )
            if len(false_edges) != 1:
                issues.append(
                    ValidationIssue(
                        nodeId=node.id,
                        severity="error",
                        code="decision_false_branch",
                        message='Decision nodes must have exactly one FALSE branch.',
                    )
                )
            if unlabeled_edges:
                issues.append(
                    ValidationIssue(
                        nodeId=node.id,
                        severity="error",
                        code="decision_unlabeled_branch",
                        message='Decision branches must connect through the TRUE or FALSE handles.',
                    )
                )

            groups = config.get("conditionGroups", [])
            if not isinstance(groups, list) or not groups:
                issues.append(
                    ValidationIssue(
                        nodeId=node.id,
                        severity="error",
                        code="decision_missing_conditions",
                        message='Decision nodes must define at least one condition group.',
                    )
                )
            else:
                for group in groups:
                    conditions = group.get("conditions", []) if isinstance(group, dict) else []

                    if not conditions:
                        issues.append(
                            ValidationIssue(
                                nodeId=node.id,
                                severity="error",
                                code="decision_empty_group",
                                message='Each decision condition group must contain at least one condition.',
                            )
                        )
                        continue

                    for condition in conditions:
                        if not isinstance(condition, dict):
                            issues.append(
                                ValidationIssue(
                                    nodeId=node.id,
                                    severity="error",
                                    code="decision_invalid_condition",
                                    message='Decision conditions must be valid objects.',
                                )
                            )
                            continue

                        field = str(condition.get("field", "")).strip()
                        operator = str(condition.get("operator", "eq")).strip()
                        value = str(condition.get("value", ""))

                        if not field:
                            issues.append(
                                ValidationIssue(
                                    nodeId=node.id,
                                    severity="error",
                                    code="decision_missing_field",
                                    message='Decision conditions must include a field path.',
                                )
                            )
                        if operator not in SUPPORTED_OPERATORS:
                            issues.append(
                                ValidationIssue(
                                    nodeId=node.id,
                                    severity="error",
                                    code="decision_invalid_operator",
                                    message='Decision conditions must use a supported operator.',
                                )
                            )
                        if operator not in ("is_null", "is_not_null") and value.strip() == "":
                            issues.append(
                                ValidationIssue(
                                    nodeId=node.id,
                                    severity="error",
                                    code="decision_missing_value",
                                    message='Decision conditions must include a comparison value.',
                                )
                            )

            continue

        if node.nodeType == "end":
            if outgoing:
                issues.append(
                    ValidationIssue(
                        nodeId=node.id,
                        severity="error",
                        code="end_has_outgoing",
                        message='End nodes cannot have outgoing connections.',
                    )
                )
            continue

        if len(outgoing) == 0:
            issues.append(
                ValidationIssue(
                    nodeId=node.id,
                    severity="error",
                    code="missing_next_node",
                    message='This node must connect to a next node.',
                )
            )
        if len(outgoing) > 1:
            issues.append(
                ValidationIssue(
                    nodeId=node.id,
                    severity="error",
                    code="multiple_next_nodes",
                    message='This node can only connect to one next node.',
                )
            )

        if node.nodeType == "wait":
            amount = config.get("amount", 0)
            unit = str(config.get("unit", "minutes"))

            try:
                amount_value = int(float(amount))
            except (TypeError, ValueError):
                amount_value = 0

            if amount_value < 1:
                issues.append(
                    ValidationIssue(
                        nodeId=node.id,
                        severity="error",
                        code="wait_invalid_amount",
                        message='Wait nodes must use a positive duration.',
                    )
                )
            if unit not in ("seconds", "minutes", "hours", "days"):
                issues.append(
                    ValidationIssue(
                        nodeId=node.id,
                        severity="error",
                        code="wait_invalid_unit",
                        message='Wait nodes must use a supported duration unit.',
                    )
                )

        if node.nodeType == "api_call":
            method = str(config.get("method", "GET")).upper()
            url = str(config.get("url", "")).strip()
            headers_raw = str(config.get("headers", "{}") or "{}")
            body_raw = str(config.get("body", "") or "")

            if method not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                issues.append(
                    ValidationIssue(
                        nodeId=node.id,
                        severity="error",
                        code="api_invalid_method",
                        message='API call nodes must use a supported HTTP method.',
                    )
                )
            if not url:
                issues.append(
                    ValidationIssue(
                        nodeId=node.id,
                        severity="error",
                        code="api_missing_url",
                        message='API call nodes must define a URL.',
                    )
                )

            parsed_headers = _coerce_json_candidate(headers_raw)
            if parsed_headers is None or not isinstance(parsed_headers, dict):
                issues.append(
                    ValidationIssue(
                        nodeId=node.id,
                        severity="error",
                        code="api_invalid_headers",
                        message='API call headers must be valid JSON.',
                    )
                )

            if method != "GET" and body_raw.strip():
                parsed_body = _coerce_json_candidate(body_raw)
                if parsed_body is None:
                    issues.append(
                        ValidationIssue(
                            nodeId=node.id,
                            severity="error",
                            code="api_invalid_body",
                            message='API call request bodies must be valid JSON.',
                        )
                    )

    if len(trigger_nodes) == 1:
        start_node_id = trigger_nodes[0].id
        adjacency: Dict[str, List[str]] = {node.id: [] for node in nodes}
        for edge in edges:
            if edge.source in adjacency and edge.target in adjacency:
                adjacency[edge.source].append(edge.target)

        reachable: Set[str] = set()
        queue: List[str] = [start_node_id]

        while queue:
            current = queue.pop(0)
            if current in reachable:
                continue
            reachable.add(current)
            queue.extend(adjacency.get(current, []))

        for node in nodes:
            if node.id not in reachable:
                issues.append(
                    ValidationIssue(
                        nodeId=node.id,
                        severity="error",
                        code="unreachable_node",
                        message='This node is unreachable from the trigger node.',
                    )
                )

        visited: Set[str] = set()
        stack: Set[str] = set()
        cycle_nodes: List[str] = []

        def dfs(node_id: str) -> bool:
            visited.add(node_id)
            stack.add(node_id)

            for neighbor in adjacency.get(node_id, []):
                if neighbor not in visited:
                    if dfs(neighbor):
                        cycle_nodes.append(node_id)
                        return True
                elif neighbor in stack:
                    cycle_nodes.extend([neighbor, node_id])
                    return True

            stack.remove(node_id)
            return False

        if dfs(start_node_id):
            issues.extend(_build_cycle_issues(cycle_nodes))

    deduped: List[ValidationIssue] = []
    seen: Set[Tuple[Optional[str], str, Optional[str]]] = set()
    for issue in issues:
        key = (issue.nodeId, issue.message, issue.code)
        if key not in seen:
            deduped.append(issue)
            seen.add(key)

    return deduped


def normalize_workflow_graph(
    workflow_id: str,
    workflow_name: str,
    status: WorkflowStatus,
    nodes: List[WorkflowNodeDefinition],
    edges: List[WorkflowEdgeDefinition],
) -> Dict[str, Any]:
    validation_issues = validate_workflow_graph(nodes, edges)
    blocking_issues = [issue for issue in validation_issues if issue.severity == "error"]

    if blocking_issues:
        raise WorkflowValidationException("Workflow validation failed.", validation_issues)

    trigger_node = next(
        node for node in nodes if node.nodeType in ("manual_trigger", "webhook_trigger")
    )
    trigger_type: TriggerType = "webhook" if trigger_node.nodeType == "webhook_trigger" else "manual"
    webhook_path = workflow_id if trigger_type == "webhook" else None
    node_lookup = {node.id: node for node in nodes}
    enriched_nodes: List[WorkflowNodeDefinition] = []

    for node in nodes:
        updated_config = dict(node.config or {})
        if node.nodeType == "webhook_trigger":
            updated_config["webhookPath"] = webhook_path or ""

        enriched_nodes.append(
            WorkflowNodeDefinition(
                id=node.id,
                nodeType=node.nodeType,
                label=node.label or NODE_LABELS.get(node.nodeType, node.nodeType),
                position=node.position,
                config=updated_config,
            )
        )

    outgoing_map: Dict[str, List[WorkflowEdgeDefinition]] = {
        node.id: _outgoing_edges(edges, node.id) for node in enriched_nodes
    }

    normalized_nodes: Dict[str, NormalizedWorkflowNode] = {}

    for node in enriched_nodes:
        node_outgoing = outgoing_map.get(node.id, [])

        if node.nodeType in ("manual_trigger", "webhook_trigger"):
            normalized_nodes[node.id] = NormalizedWorkflowNode(
                id=node.id,
                label=node.label,
                type="trigger",
                node_type=node.nodeType,
                trigger_kind="webhook" if node.nodeType == "webhook_trigger" else "manual",
                config=dict(node.config or {}),
                next_node=node_outgoing[0].target if node_outgoing else None,
            )
            continue

        if node.nodeType == "decision":
            next_nodes: Dict[str, str] = {}
            for edge in node_outgoing:
                if edge.sourceHandle in ("true", "false"):
                    next_nodes[edge.sourceHandle] = edge.target

            normalized_nodes[node.id] = NormalizedWorkflowNode(
                id=node.id,
                label=node.label,
                type="decision",
                node_type=node.nodeType,
                config={"conditionGroups": node.config.get("conditionGroups", [])},
                next_nodes=next_nodes,
            )
            continue

        action_name = {
            "wait": "wait",
            "api_call": "api_call",
            "end": "end_workflow",
        }.get(node.nodeType, node.nodeType)

        normalized_nodes[node.id] = NormalizedWorkflowNode(
            id=node.id,
            label=node.label,
            type="action",
            node_type=node.nodeType,
            action_name=action_name,
            config=dict(node.config or {}),
            next_node=node_outgoing[0].target if node_outgoing else None,
        )

    normalized_definition = NormalizedWorkflowDefinition(
        startAt=trigger_node.id,
        nodes=normalized_nodes,
    )

    return {
        "id": workflow_id,
        "name": workflow_name.strip() or "Untitled Workflow",
        "status": status,
        "triggerType": trigger_type,
        "webhookPath": webhook_path,
        "description": build_workflow_description(
            workflow_name.strip() or "Untitled Workflow", trigger_type, len(enriched_nodes)
        ),
        "nodes": enriched_nodes,
        "edges": edges,
        "definition": normalized_definition,
        "validationIssues": validation_issues,
        "nodeLookup": node_lookup,
    }
