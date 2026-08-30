import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("queue CareerPilot daily searches", { minutes: 1 }, internal.searches.queueDueDailySearches);
crons.daily("refresh Greenhouse inventory", { hourUTC: 18, minuteUTC: 17 }, internal.greenhouse.refreshInventory, { reason: "daily" });

export default crons;
