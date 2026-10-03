export const RESEARCH_QUOTE = "Starter's free plan caps recordings at 30 minutes. Plus captures computer audio without a meeting bot.";
export const RESEARCH_FACTS = [
  { sourceId: 'S1', claim: 'Starter caps recordings on its free plan at 30 minutes.', quote: RESEARCH_QUOTE, dimension: 'limits' },
  { sourceId: 'S2', claim: 'Plus captures computer audio without a meeting bot.', quote: RESEARCH_QUOTE, dimension: 'capture' },
];
export const EDITOR_FIXTURE = { score: 9, supported: true, specificHook: true, usefulTakeaway: true, issues: [] };
export const SCRIPT_FIXTURE = {
  title: 'Your free recorder can cut your meeting short',
  scenes: [
    { durationSeconds: 6, narration: "Your free meeting recorder might stop while you're still talking. Here's the limit to check first.", caption: 'Check the recording cap', visual: 'Animate a timer stopping at 30 minutes, labeled plan limit.', factIds: ['F1'] },
    { durationSeconds: 12, narration: "Starter's plan caps recordings at thirty minutes. For a forty-minute call, that limit matters before you even compare the summaries. Check your usual meeting length against the plan.", caption: '30-minute limit', visual: 'Highlight the 30-minute cap, then draw a sample 40-minute timeline.', factIds: ['F1'] },
    { durationSeconds: 11, narration: 'Plus lists capture without a meeting bot. If an extra attendee is the problem, that workflow detail is worth checking alongside the recording limits.', caption: 'No meeting bot', visual: 'Draw computer audio flowing into Plus; cross out an extra bot attendee.', factIds: ['F2'] },
    { durationSeconds: 11, narration: "Long calls? Start with the recording cap. Don't want a bot joining? Check Plus's capture setup. Pick the workflow that handles your meetings before paying for extras.", caption: 'Match the workflow first', visual: 'Show two labeled decision cards: long calls and no bot.', factIds: ['F1', 'F2'] },
  ],
};
