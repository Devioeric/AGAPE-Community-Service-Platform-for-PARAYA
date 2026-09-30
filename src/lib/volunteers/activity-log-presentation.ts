/** Actor UUIDs are authoritative even when two volunteers share a name. */
export function selectVolunteerLogs<T extends { volunteer_id: string }>(logs: readonly T[], volunteerId: string | null): T[] {
  return volunteerId ? logs.filter((log) => log.volunteer_id === volunteerId) : [];
}

export function indexVolunteerNames(volunteers: readonly { id: string; full_name: string }[]): Map<string, string> {
  return new Map(volunteers.map((volunteer) => [volunteer.id, volunteer.full_name]));
}
