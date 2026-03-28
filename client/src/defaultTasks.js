/**
 * Server seed list for new accounts (`server/defaultTasks.js`).
 * The live list is per-user from GET /api/user/default-templates.
 */
export const DEFAULT_DAILY_TASKS = [
  { id: "daily-running", title: "Daily Running" },
  {
    id: "daily-marketing",
    title: "Daily Marketing for 1 hour in the day any time",
  },
  { id: "daily-creatine", title: "Daily Creatine 1 Scoop" },
  { id: "daily-milk", title: "Daily One Packet Milk" },
  {
    id: "daily-protein",
    title:
      "Daily Protein in 2 meals take Paneer, Sub, or Two Sandwhich, anything which have protein",
  },
  { id: "daily-gym", title: "Today Gym" },
  {
    id: "daily-avoid-chips-softdrinks",
    title: "Avoid eating chips and softdrinks",
  },
];
