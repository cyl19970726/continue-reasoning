# Rate Limit Handling Example

This document demonstrates how the Deep Research Agent automatically handles OpenAI rate limits using the WaitingTool.

## Scenario: Rate Limit Encountered

When the agent encounters a rate limit error like this:

```
Rate limit reached for gpt-4o in organization org-XXX on tokens per min (TPM): 
Limit 30000, Used 19392, Requested 16738. Please try again in 12.26s.
```

## Agent's Automatic Response

The agent will automatically:

### 1. Detect the Error
```
[ERROR] [OpenAIWrapper] Error in callStream: Rate limit reached...
```

### 2. Use WaitingTool
```typescript
WaitingTool({
  seconds: 20,  // Based on error recommendation (12.26s + buffer)
  reason: "Rate limit encountered, waiting before retry"
})
```

### 3. Log the Wait
```
[INFO] WaitingTool: Starting wait for 20 seconds. 
Reason: Rate limit encountered, waiting before retry
```

### 4. Resume Operation
After waiting, the agent continues with the exact same operation that failed.

## Example Agent Behavior

```markdown
## Step 7: Continuing Research

<think>
<reasoning>
I encountered a rate limit error in the previous step. I need to:
1. Use WaitingTool to pause execution for about 20 seconds
2. Wait for the rate limit to reset
3. Continue with the web search that was interrupted
</reasoning>
</think>

<interactive>
<response>
I encountered an OpenAI rate limit. Let me wait for the rate limit to reset before continuing.
</response>
</interactive>

**Tool Call**: WaitingTool
```

## Benefits

1. **Automatic Recovery**: No manual intervention required
2. **Preserves Progress**: Continues exactly where it left off
3. **Optimal Timing**: Waits appropriate duration based on error message
4. **Transparent Process**: User can see what's happening

## Configuration

The agent is configured with increased tool call retention (20 steps) to handle complex research workflows with potential rate limit interruptions:

```typescript
const enhancedPromptProcessor = createEnhancedPromptProcessor('', undefined, 'enhanced', {
  [MessageType.TOOL_CALL]: 20,  // Increased from 5 to handle rate limits
  // ... other settings
});
```

## Testing Rate Limit Handling

You can test the WaitingTool independently:

```bash
npx tsx packages/deep-research/examples/test-waiting-tool.ts
```

Expected output:
```
🧪 Testing WaitingTool...
[INFO] WaitingTool: Starting wait for 3 seconds. Reason: Testing WaitingTool functionality
[INFO] WaitingTool: Successfully waited for 3 seconds
📊 Test Results:
   ⏱️  Expected wait: 3 seconds
   ⏱️  Actual wait: 3 seconds
   ✅ Success: true
   📝 Message: Successfully waited for 3 seconds. Reason: Testing WaitingTool functionality
   🔢 Waited seconds: 3
🎉 WaitingTool test PASSED!
```

## Best Practices

1. **Wait Duration**: 15-30 seconds for OpenAI rate limits
2. **Reason Tracking**: Always specify clear reasons for debugging
3. **Error Context**: Include original error details in logs
4. **Retry Strategy**: Resume exact same operation after waiting
5. **User Communication**: Keep user informed of wait status 