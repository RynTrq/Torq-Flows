from __future__ import annotations

import unittest
from importlib import import_module
from types import SimpleNamespace

from backend.app.graph import (
    WorkflowValidationException,
    build_wait_seconds,
    evaluate_condition_groups,
    normalize_workflow_graph,
    validate_workflow_graph,
)
from backend.app.models import WorkflowEdgeDefinition, WorkflowNodeDefinition


def build_node(
    node_id: str,
    node_type: str,
    *,
    label: str | None = None,
    config: dict | None = None,
) -> WorkflowNodeDefinition:
    return WorkflowNodeDefinition(
        id=node_id,
        nodeType=node_type,
        label=label or node_type.replace("_", " ").title(),
        position={"x": 0, "y": 0},
        config=config or {},
    )


def build_edge(
    edge_id: str,
    source: str,
    target: str,
    *,
    source_handle: str | None = None,
) -> WorkflowEdgeDefinition:
    return WorkflowEdgeDefinition(
        id=edge_id,
        source=source,
        target=target,
        sourceHandle=source_handle,
    )


class WorkflowGraphTests(unittest.TestCase):
    def build_valid_flow(self, trigger_type: str = "manual_trigger"):
        nodes = [
            build_node("trigger_1", trigger_type, label="Start"),
            build_node(
                "decision_1",
                "decision",
                label="Check Payload",
                config={
                    "conditionGroups": [
                        {
                            "id": "group-1",
                            "conditions": [
                                {
                                    "id": "cond-1",
                                    "field": "input.amount",
                                    "operator": "gte",
                                    "value": "10",
                                }
                            ],
                        }
                    ]
                },
            ),
            build_node("wait_1", "wait", label="Pause", config={"amount": 5, "unit": "minutes"}),
            build_node(
                "api_1",
                "api_call",
                label="Fetch",
                config={
                    "method": "POST",
                    "url": "https://example.com/hook",
                    "headers": '{"Authorization": "Bearer {{input.token}}"}',
                    "body": '{"amount": "{{input.amount}}"}',
                    "timeout": 30,
                },
            ),
            build_node("end_1", "end", label="Done", config={"outputExpression": "$.body"}),
        ]
        edges = [
            build_edge("edge-1", "trigger_1", "decision_1"),
            build_edge("edge-2", "decision_1", "wait_1", source_handle="true"),
            build_edge("edge-3", "decision_1", "end_1", source_handle="false"),
            build_edge("edge-4", "wait_1", "api_1"),
            build_edge("edge-5", "api_1", "end_1"),
        ]
        return nodes, edges

    def test_normalize_workflow_graph_builds_expected_definition(self):
        nodes, edges = self.build_valid_flow()

        normalized = normalize_workflow_graph(
            workflow_id="workflow-123",
            workflow_name="Order Flow",
            status="active",
            nodes=nodes,
            edges=edges,
        )

        self.assertEqual(normalized["triggerType"], "manual")
        self.assertIsNone(normalized["webhookPath"])
        self.assertEqual(normalized["definition"].startAt, "trigger_1")
        self.assertEqual(normalized["definition"].nodes["trigger_1"].next_node, "decision_1")
        self.assertEqual(
            normalized["definition"].nodes["decision_1"].next_nodes,
            {"true": "wait_1", "false": "end_1"},
        )
        self.assertEqual(normalized["definition"].nodes["wait_1"].action_name, "wait")
        self.assertEqual(normalized["definition"].nodes["api_1"].action_name, "api_call")
        self.assertEqual(normalized["definition"].nodes["end_1"].action_name, "end_workflow")

    def test_webhook_workflow_uses_workflow_id_as_public_path(self):
        nodes, edges = self.build_valid_flow(trigger_type="webhook_trigger")

        normalized = normalize_workflow_graph(
            workflow_id="workflow-webhook-456",
            workflow_name="Webhook Flow",
            status="active",
            nodes=nodes,
            edges=edges,
        )

        self.assertEqual(normalized["triggerType"], "webhook")
        self.assertEqual(normalized["webhookPath"], "workflow-webhook-456")
        self.assertEqual(
            normalized["definition"].nodes["trigger_1"].config["webhookPath"],
            "workflow-webhook-456",
        )

    def test_validation_rejects_missing_decision_branch_and_bad_headers(self):
        nodes, edges = self.build_valid_flow()
        nodes[3] = build_node(
            "api_1",
            "api_call",
            label="Fetch",
            config={
                "method": "POST",
                "url": "https://example.com/hook",
                "headers": '{"Authorization": }',
                "body": '{"amount": "{{input.amount}}"}',
                "timeout": 30,
            },
        )
        edges = [edge for edge in edges if edge.id != "edge-3"]

        issues = validate_workflow_graph(nodes, edges)
        issue_codes = {issue.code for issue in issues}

        self.assertIn("decision_false_branch", issue_codes)
        self.assertIn("api_invalid_headers", issue_codes)

    def test_invalid_graph_raises_workflow_validation_exception(self):
        nodes, edges = self.build_valid_flow()
        edges.append(build_edge("edge-cycle", "api_1", "decision_1"))

        with self.assertRaises(WorkflowValidationException):
            normalize_workflow_graph(
                workflow_id="workflow-cycle",
                workflow_name="Broken Flow",
                status="active",
                nodes=nodes,
                edges=edges,
            )

    def test_wait_and_decision_helpers_cover_required_behavior(self):
        self.assertEqual(build_wait_seconds(1, "minutes"), 60)
        self.assertEqual(build_wait_seconds(2, "hours"), 7200)

        current_payload = {"items": ["a", "b"], "status": "approved"}
        original_input = {"amount": 12, "customer": {"segment": "gold"}}
        condition_groups = [
            {
                "id": "group-1",
                "conditions": [
                    {"field": "input.amount", "operator": "gte", "value": "10"},
                    {"field": "status", "operator": "eq", "value": "approved"},
                    {"field": "items", "operator": "contains", "value": "a"},
                ],
            }
        ]

        self.assertTrue(
            evaluate_condition_groups(condition_groups, current_payload, original_input)
        )

    def test_decision_helpers_support_literal_left_operands(self):
        numeric_literal_group = [
            {
                "id": "group-1",
                "conditions": [
                    {"field": "1", "operator": "eq", "value": "1"},
                ],
            }
        ]
        string_literal_group = [
            {
                "id": "group-2",
                "conditions": [
                    {"field": '"approved"', "operator": "eq", "value": "approved"},
                ],
            }
        ]

        self.assertTrue(evaluate_condition_groups(numeric_literal_group, {}, {}))
        self.assertTrue(evaluate_condition_groups(string_literal_group, {}, {}))

    def test_decision_helpers_ignore_invalid_conditions_at_runtime(self):
        condition_groups = [{"id": "group-1", "conditions": ["invalid-condition"]}]

        self.assertFalse(evaluate_condition_groups(condition_groups, {}, {}))


class WebhookExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def test_start_run_from_webhook_looks_up_by_webhook_path(self):
        import sys
        from unittest.mock import AsyncMock, patch

        fetchrow_mock = AsyncMock(return_value=None)
        asyncpg_stub = SimpleNamespace(Pool=object, Record=object, create_pool=AsyncMock())

        with patch.dict(sys.modules, {"asyncpg": asyncpg_stub}):
            service = import_module("backend.app.service")

        with patch.object(service, "fetchrow", fetchrow_mock):
            with self.assertRaises(service.NotFoundError):
                await service.start_run_from_webhook('not-a-uuid-path', {})

        query, webhook_path = fetchrow_mock.await_args.args
        self.assertIn('WHERE webhook_path = $1', query)
        self.assertEqual(webhook_path, 'not-a-uuid-path')


if __name__ == "__main__":
    unittest.main()
