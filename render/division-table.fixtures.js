// Existing artwork/layout cases keep their records while migrating to DivisionTable.
export function divisionFixture(rows, { preserveMissingIds = false } = {}) {
  const available = rows.some(row => row.w > 0 || row.l > 0);
  return { sport: 'flag-football', status: available ? 'available' : 'preseason', unpostedCount: available ? 0 : null,
    rows: rows.map((row, i) => ({
      teamId: preserveMissingIds ? row.teamId : row.teamId ?? i + 1,
      shortName: row.team, name: row.team, coach: row.coach ?? null,
      isMe: row.isMe ?? false, rank: available ? i + 1 : 1, rankShared: !available,
      played: (row.w ?? 0) + (row.l ?? 0), wins: row.w ?? 0, losses: row.l ?? 0,
      drawn: 0, scoreDifference: 0, leaguePoints: null,
    })),
  };
}
