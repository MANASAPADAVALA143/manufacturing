import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { ToastProvider } from '@/components/Toast';
import type { ModuleId } from '@/lib/types';
import Overview from '@/components/modules/Overview';
import SalesRFQ from '@/components/modules/SalesRFQ';
import Procurement from '@/components/modules/Procurement';
import APAutomation from '@/components/modules/APAutomation';
import Production from '@/components/modules/Production';
import Quality from '@/components/modules/Quality';
import Maintenance from '@/components/modules/Maintenance';
import Inventory from '@/components/modules/Inventory';
import Logistics from '@/components/modules/Logistics';
import AIAssistant from '@/components/modules/AIAssistant';
import Reports from '@/components/modules/Reports';

export default function App() {
  const [active, setActive] = useState<ModuleId>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);

  const renderModule = () => {
    switch (active) {
      case 'overview':
        return <Overview onNavigate={setActive} />;
      case 'sales':
        return <SalesRFQ />;
      case 'procurement':
        return <Procurement />;
      case 'ap':
        return <APAutomation />;
      case 'production':
        return <Production />;
      case 'quality':
        return <Quality />;
      case 'maintenance':
        return <Maintenance />;
      case 'inventory':
        return <Inventory />;
      case 'logistics':
        return <Logistics />;
      case 'assistant':
        return <AIAssistant />;
      case 'reports':
        return <Reports />;
      default:
        return <Overview onNavigate={setActive} />;
    }
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-base-bg text-ink-primary">
        <Sidebar
          active={active}
          onSelect={setActive}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div className="lg:pl-[220px]">
          <TopBar active={active} onOpenMobile={() => setMobileOpen(true)} />
          <main className="p-5 lg:p-8">{renderModule()}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
