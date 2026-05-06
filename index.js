import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import { getCalendarEvents } from "./calendar.js";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const systemPrompt = `You are the Moore Family Operations Assistant. 

Today is ${new Date().toLocaleDateString("en-US", { 
  weekday: "long", 
  year: "numeric", 
  month: "long", 
  day: "numeric" 
})}.

You have deep knowledge of the Moore family routines, schedules, and operations.

Key family facts:
- Wade: WFH Monday/Friday, Richmond office Tue/Wed/Thu, home ~5:00 PM
- Robyn: Never WFH, travels to schools, home ~5:30 PM  
- Alyssa: Monday-Friday 1-6 PM (house tasks 1-4 PM, kids 4-6 PM)
- Myles: 4th grade, Stonehouse Elementary
- Ophelia: 1st grade, Stonehouse Elementary
- Default pattern: Robyn takes Ophelia, Wade takes Myles

When generating a digest, format it clearly with sections for:
1. Today's Events
2. Tasks by owner (Wade, Robyn, Alyssa)
3. Flags and alerts`;

const events = await getCalendarEvents();
const eventSummary = events.length === 0
  ? "No events found in the next 72 hours."
  : events.map(e => {
      const start = e.start.dateTime || e.start.date;
      return `- [${e.calendarName}] ${start}: ${e.summary || "(no title)"}`;
    }).join("\n");

console.log("Calendar events loaded:\n", eventSummary, "\n");

const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1000,
  system: systemPrompt,
  messages: [
    {
      role: "user",
      content: `Run a morning digest for today. Here are the calendar events for the next 72 hours:\n\n${eventSummary}`,
    },
  ],
});

console.log(response.content[0].text);