export default function LiveCounters({ connected, lastSync }: { connected: boolean; lastSync: Date | null }) {
  return <div className={`operations-live-status ${connected ? 'connected' : ''}`}><i /><div><strong>{connected ? 'التحديث المباشر متصل' : 'جاري الاتصال المباشر'}</strong><span>{lastSync ? `آخر مزامنة ${lastSync.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}` : 'بانتظار أول مزامنة'}</span></div></div>;
}
