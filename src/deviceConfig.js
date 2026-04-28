// ─── Device registry ─────────────────────────────────────────
// Add the Firestore collection name for each device here
// TODO: IF ADDING NEW DEVICE, ADD ITS COLLECTION NAME HERE
export const DEVICE_IDS = ["SCL-001", "SCL-002"];

// Parses document IDs like "041926_230340" (MMDDYY_HHMMSS) into a Date (UTC)
export const parseTimestampId = (id) => {
  try {
    const [datePart, timePart] = id.split("_");
    if (!datePart || !timePart || datePart.length < 6 || timePart.length < 6)
      return null;
    const mm = datePart.slice(0, 2);
    const dd = datePart.slice(2, 4);
    const yy = datePart.slice(4, 6);
    const hh = timePart.slice(0, 2);
    const min = timePart.slice(2, 4);
    const ss = timePart.slice(4, 6);
    const d = new Date(`20${yy}-${mm}-${dd}T${hh}:${min}:${ss}Z`);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};
