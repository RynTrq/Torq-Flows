# Walkthrough Video Script

Use this as the recording checklist for the required walkthrough video.

## Suggested Flow

1. Open the workflow builder.
2. Add a trigger node, a decision node, a wait node, an API call node, and an end node.
3. Connect the nodes, making the decision TRUE/FALSE branches visually clear.
4. Configure:
   - manual trigger payload or webhook trigger URL
   - decision conditions
   - wait duration
   - API call URL, method, headers, and body
   - end node output expression if desired
5. Save the workflow.
6. Reload the saved workflow from workflow management to show load works.
7. Run a manual-trigger workflow from the UI and show:
   - execution logs
   - final output
   - run history entry
8. Show a workflow that contains a wait node and a decision node executing end-to-end.
9. Trigger a webhook workflow with `POST /api/webhooks/{workflow_id}` or from the builder’s webhook test flow.
10. Open the execution dashboard and inspect:
   - run status
   - node logs
   - final output or error details

## Recording Tips

- Keep wait durations short for the demo, such as 1 minute or less if you want the video to stay compact.
- Use a simple public API or a local mock endpoint for the API Call node.
- Show one successful branch and, if time allows, one failing API call to demonstrate error handling.
