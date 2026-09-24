import { formatKoreanDate } from "@/lib/dates";
import type { Task } from "@/lib/schemas";
import type { MemberLoad, TeamStats } from "@/lib/stats";

const pad = (n: number) => String(n).padStart(2, "0");

export function Metrics({ stats }: { stats: TeamStats }) {
  return (
    <div className="metrics" data-testid="metrics">
      <div className="metric">
        <small>전체 업무</small>
        <strong>{pad(stats.total)}</strong>
        <em>팀 전체 카드</em>
      </div>
      <div className="metric">
        <small>진행 중</small>
        <strong>{pad(stats.doing)}</strong>
        <em>할 일 {stats.todo}건 대기</em>
      </div>
      <div className="metric">
        <small>완료율</small>
        <strong>{stats.completionRate}%</strong>
        <em>완료 {stats.done}건</em>
      </div>
      <div className="metric">
        <small>지연 업무</small>
        <strong className={stats.overdue ? "risk" : ""}>{pad(stats.overdue)}</strong>
        <em>{stats.overdue ? "확인 필요" : stats.soon ? `임박 ${stats.soon}건` : "없음"}</em>
      </div>
    </div>
  );
}

const ROW = 34;
const LABEL_W = 64;
const VALUE_W = 64;
const WIDTH = 400;

/** 인원별 진행 중 카드 수(초록 막대)와 지연 수(아래 러스트 막대) — SVG 가로 막대 */
export function LoadChart({ loads }: { loads: MemberLoad[] }) {
  const max = Math.max(1, ...loads.map((l) => Math.max(l.doing, l.overdue)));
  const track = WIDTH - LABEL_W - VALUE_W;
  return (
    <div className="load">
      <div className="kicker">WORKLOAD / 진행 중 카드 수</div>
      {loads.length === 0 ? (
        <div className="muted-text">팀원 명단을 등록하면 인원별 부하가 표시됩니다.</div>
      ) : (
        <svg viewBox={`0 0 ${WIDTH} ${loads.length * ROW}`} role="img" aria-label="인원별 업무 부하 막대 그래프">
          {loads.map((l, i) => {
            const y = i * ROW;
            const doingW = (l.doing / max) * track;
            const overdueW = (l.overdue / max) * track;
            return (
              <g key={l.name} transform={`translate(0 ${y})`}>
                <title>{`${l.name}: 진행 중 ${l.doing}건, 지연 ${l.overdue}건, 할 일 ${l.todo}건`}</title>
                <text x="0" y="19" fontSize="11" fontWeight="800" fill="var(--ink)">
                  {l.name.length > 5 ? `${l.name.slice(0, 5)}…` : l.name}
                </text>
                <rect x={LABEL_W} y="10" width={track} height="9" fill="#dce2d4" />
                <rect x={LABEL_W} y="10" width={doingW} height="9" fill="var(--green)" />
                {l.overdue > 0 && <rect x={LABEL_W} y="21" width={overdueW} height="4" fill="var(--rust)" />}
                <text x={WIDTH} y="19" fontSize="10" textAnchor="end" fill="var(--muted)">
                  {`${l.doing}건${l.overdue ? ` · 지연 ${l.overdue}` : ""}`}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <div className="load-legend">
        <span>
          <i style={{ background: "var(--green)" }} />
          진행 중
        </span>
        <span>
          <i style={{ background: "var(--rust)" }} />
          지연(마감 지남)
        </span>
      </div>
    </div>
  );
}

export function Deadlines({ alerts }: { alerts: Array<Task & { state: "overdue" | "soon" }> }) {
  return (
    <div>
      <div className="kicker">DEADLINE / 지연과 임박</div>
      {alerts.length === 0 && <div className="muted-text">지연되거나 3일 안에 마감되는 업무가 없습니다.</div>}
      {alerts.map((t) => (
        <div className="alert" key={t.id} data-testid="deadline-alert">
          <span className={`mark${t.state === "soon" ? " soon" : ""}`}>{t.state === "overdue" ? "!" : "○"}</span>
          <div>
            <strong>{t.title}</strong>
            <small>
              {t.owner} · {formatKoreanDate(t.due)} {t.state === "overdue" ? "마감 지남" : "마감 임박"}
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}
