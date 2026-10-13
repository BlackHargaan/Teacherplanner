// Seating chart helpers. Seats are keyed "row-col" (both counted from 0).

const inGrid = (chart, key) => {
  const [r, c] = key.split('-').map(Number);
  return r >= 0 && c >= 0 && r < chart.rows && c < chart.cols;
};

/** Ids of students sitting at a desk that is actually on the grid. */
export function seatedIds(chart) {
  return new Set(Object.entries(chart.seats || {}).filter(([key]) => inGrid(chart, key)).map(([, id]) => id));
}

/** Seats left outside the grid after Rows or Columns was lowered. */
export function seatsOutsideGrid(chart) {
  return Object.keys(chart.seats || {}).filter((key) => !inGrid(chart, key));
}

/** After the grid shrinks: unseat students sitting outside it. Mutates the chart. */
export function pruneSeats(chart) {
  for (const key of seatsOutsideGrid(chart)) delete chart.seats[key];
  return chart;
}

/** A Rows / Columns box value as a whole number from 1 to 15, or null while it's blank or out of range. */
export function gridSize(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 15 ? n : null;
}
