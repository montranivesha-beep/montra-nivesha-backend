const pool = require('./pool');

function timeToMin(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}

async function checkReservationConflict(tableId, date, time, duration, excludeId) {
  const start = timeToMin(time);
  const end = start + Number(duration);
  const { rows } = await pool.query(
    `SELECT time, duration FROM reservations
     WHERE table_id=$1 AND date=$2 AND status='confirmed' AND ($3::int IS NULL OR id <> $3)`,
    [tableId, date, excludeId || null]
  );
  return rows.some((r) => {
    const rs = timeToMin(r.time);
    const re = rs + r.duration;
    return start < re && rs < end;
  });
}

// Returns an error message if the requested time falls outside the table's
// section operating hours, or null if it's fine / hours aren't restricted.
async function checkSectionHours(tableId, time, duration) {
  const { rows } = await pool.query(
    `SELECT s.name, s.open_time, s.close_time FROM tables t
     JOIN sections s ON s.id = t.section_id WHERE t.id = $1`,
    [tableId]
  );
  const sec = rows[0];
  if (!sec || !sec.open_time || !sec.close_time) return null;
  const openM = timeToMin(sec.open_time);
  const closeM = timeToMin(sec.close_time);
  const startM = timeToMin(time);
  const endM = startM + Number(duration);
  if (startM >= openM && endM <= closeM) return null;
  return `${sec.name} is open ${sec.open_time}–${sec.close_time}. Choose a time within operating hours.`;
}

async function checkEventConflict(venueId, date, startTime, endTime, excludeId) {
  const start = timeToMin(startTime);
  const end = timeToMin(endTime);
  const { rows } = await pool.query(
    `SELECT start_time, end_time FROM events
     WHERE venue_id=$1 AND date=$2 AND status<>'Cancelled' AND ($3::int IS NULL OR id <> $3)`,
    [venueId, date, excludeId || null]
  );
  return rows.some((r) => {
    const es = timeToMin(r.start_time);
    const ee = timeToMin(r.end_time);
    return start < ee && es < end;
  });
}

module.exports = { timeToMin, checkReservationConflict, checkSectionHours, checkEventConflict };
