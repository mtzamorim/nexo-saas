import { useState } from 'react';
import { useWorkspace, useWorkspaceQuery } from '../lib/session';
import type { Activity, PageResult } from '../lib/types';
import { dateTime } from '../lib/format';
import { PageHeading, Loading, ErrorState, Pagination, Avatar, EmptyState } from '../components/ui';
export function ActivityPage() {
  const [page, setPage] = useState(1); const { workspace } = useWorkspace();
  const query = useWorkspaceQuery<PageResult<Activity>>('audit', '/audit', `?page=${page}&pageSize=30`);
  if (!['OWNER', 'ADMIN'].includes(workspace.role)) return <EmptyState title="Acesso restrito." description="O histórico detalhado está disponível para administradores e proprietários." />;
  return <><PageHeading eyebrow="CONTEXTO PARA CADA MUDANÇA" title="Atividade da equipe" description="Acompanhe as ações registradas neste workspace." />{query.isPending ? <Loading /> : query.error ? <ErrorState error={query.error} retry={query.refetch} /> : <><div className="panel table-scroll"><table className="data-table"><thead><tr><th>Ação</th><th>Quem realizou</th><th>Quando</th></tr></thead><tbody>{query.data.items.map(event => <tr key={event.id}><td><strong>{event.summary}</strong><span className="table-subtitle">{event.action}</span></td><td><div className="person-cell"><Avatar small name={event.actor?.name || 'Sistema'} /><span>{event.actor?.name || 'Sistema'}</span></div></td><td className="nowrap">{dateTime(event.createdAt)}</td></tr>)}</tbody></table>{!query.data.items.length && <EmptyState title="O histórico começa aqui." description="As ações da equipe serão registradas conforme o trabalho avançar." />}</div><Pagination page={page} pageSize={30} total={query.data.total} onChange={setPage} /></>}</>;
}
