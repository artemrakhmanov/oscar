import { openai } from "@ai-sdk/openai";

/** Model choices in one place — swappable without touching routes. */
export const ANALYSIS_MODEL = openai("gpt-5-mini");
export const SCOUT_MODEL = openai("gpt-5-nano");
