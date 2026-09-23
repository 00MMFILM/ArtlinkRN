let sequence = 0;

// Unique object names, not credentials. A collision can never overwrite another
// object because server uploads also use upsert:false.
export function createMediaId() {
  sequence += 1;
  return `${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}
