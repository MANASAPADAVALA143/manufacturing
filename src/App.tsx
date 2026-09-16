import Hero from '@/components/Hero';
import Problem from '@/components/Problem';
import Modules from '@/components/Modules';
import HowItWorks from '@/components/HowItWorks';
import CaseStudy from '@/components/CaseStudy';
import FinalCTA from '@/components/FinalCTA';
import Footer from '@/components/Footer';

export default function App() {
  return (
    <div className="min-h-screen bg-base-bg text-ink-primary">
      <Hero />
      <Problem />
      <Modules />
      <HowItWorks />
      <CaseStudy />
      <FinalCTA />
      <Footer />
    </div>
  );
}
