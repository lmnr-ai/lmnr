import { ArrowRight } from "lucide-react";

export default function DatasetsAnimation() {
  return (
    <>
      <div className="relative overflow-hidden h-28 rounded-lg mt-4">
        {/* Dataset items flowing in */}
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Input datasets */}
          <div className="absolute left-0 flex flex-col space-y-2">
            <div className="dataset-item-1 w-12 h-3 bg-gray-500/70 rounded-sm"></div>
            <div className="dataset-item-2 w-10 h-3 bg-gray-500/70 rounded-sm"></div>
            <div className="dataset-item-3 w-14 h-3 bg-gray-500/70 rounded-sm"></div>
            <div className="dataset-item-4 w-8 h-3 bg-gray-500/70 rounded-sm"></div>
          </div>

          {/* Labeling area in center */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex space-x-4">
              <div className="tick-icon-1 w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500/40">
                <span className="text-green-400 text-sm">✓</span>
              </div>
              <div className="cross-icon-1 w-6 h-6 bg-red-500/20 rounded-full flex items-center justify-center border border-red-500/40">
                <span className="text-red-400 text-sm">✕</span>
              </div>
              <div className="tick-icon-2 w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500/40">
                <span className="text-green-400 text-sm">✓</span>
              </div>
              <div className="cross-icon-2 w-6 h-6 bg-red-500/20 rounded-full flex items-center justify-center border border-red-500/40">
                <span className="text-red-400 text-sm">✕</span>
              </div>
            </div>
          </div>

          {/* Output datasets */}
          <div className="absolute right-0 flex flex-col space-y-2">
            <div className="output-dataset-1 w-12 h-3 bg-green-400/70 rounded-sm"></div>
            <div className="output-dataset-2 w-10 h-3 bg-red-400/70 rounded-sm"></div>
            <div className="output-dataset-3 w-14 h-3 bg-green-400/70 rounded-sm"></div>
            <div className="output-dataset-4 w-8 h-3 bg-red-400/70 rounded-sm"></div>
          </div>

          {/* Flow arrows */}
          <div className="absolute left-32 top-1/2 transform -translate-y-1/2">
            <div className="flow-arrow-1 text-white/40 text-sm">
              <ArrowRight className="w-6 h-6 text-muted-foreground" />
            </div>
          </div>
          <div className="absolute right-32 top-1/2 transform -translate-y-1/2">
            <div className="flow-arrow-2 text-white/40 text-sm">
              <ArrowRight className="w-6 h-6 text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInLeft {
          0% { transform: translateX(-100px); opacity: 0; }
          20% { transform: translateX(-50px); opacity: 0.5; }
          40% { transform: translateX(0); opacity: 1; }
          75% { transform: translateX(0); opacity: 1; }
          90% { transform: translateX(0); opacity: 0.3; }
          100% { transform: translateX(0); opacity: 0; }
        }
        
        @keyframes popIcon {
          0%, 40% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); opacity: 1; }
          60% { transform: scale(1); opacity: 1; }
          80% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0); opacity: 0; }
        }
        
        @keyframes slideOutRight {
          0%, 50% { transform: translateX(0); opacity: 0; }
          60% { transform: translateX(0); opacity: 0.5; }
          70% { transform: translateX(0); opacity: 1; }
          80% { transform: translateX(20px); opacity: 1; }
          90% { transform: translateX(50px); opacity: 0.5; }
          100% { transform: translateX(100px); opacity: 0; }
        }
        
        @keyframes flowArrow {
          0%, 30% { opacity: 0; }
          40%, 70% { opacity: 1; }
          80%, 100% { opacity: 0; }
        }
        
        /* Dataset items animation */
        .dataset-item-1 {
          opacity: 0;
          transform: translateX(-100px);
          animation: slideInLeft 6s infinite;
          animation-delay: 0s;
        }
        
        .dataset-item-2 {
          opacity: 0;
          transform: translateX(-100px);
          animation: slideInLeft 6s infinite;
          animation-delay: 0.3s;
        }
        
        .dataset-item-3 {
          opacity: 0;
          transform: translateX(-100px);
          animation: slideInLeft 6s infinite;
          animation-delay: 0.6s;
        }
        
        .dataset-item-4 {
          opacity: 0;
          transform: translateX(-100px);
          animation: slideInLeft 6s infinite;
          animation-delay: 0.9s;
        }
        
        /* Labeling icons animation */
        .tick-icon-1 {
          opacity: 0;
          transform: scale(0);
          animation: popIcon 6s infinite;
          animation-delay: 1.5s;
        }
        
        .cross-icon-1 {
          opacity: 0;
          transform: scale(0);
          animation: popIcon 6s infinite;
          animation-delay: 1.8s;
        }
        
        .tick-icon-2 {
          opacity: 0;
          transform: scale(0);
          animation: popIcon 6s infinite;
          animation-delay: 2.1s;
        }
        
        .cross-icon-2 {
          opacity: 0;
          transform: scale(0);
          animation: popIcon 6s infinite;
          animation-delay: 2.4s;
        }
        
        /* Output datasets animation */
        .output-dataset-1 {
          opacity: 0;
          transform: translateX(0);
          animation: slideOutRight 6s infinite;
          animation-delay: 3s;
        }
        
        .output-dataset-2 {
          opacity: 0;
          transform: translateX(0);
          animation: slideOutRight 6s infinite;
          animation-delay: 3.3s;
        }
        
        .output-dataset-3 {
          opacity: 0;
          transform: translateX(0);
          animation: slideOutRight 6s infinite;
          animation-delay: 3.6s;
        }
        
        .output-dataset-4 {
          opacity: 0;
          transform: translateX(0);
          animation: slideOutRight 6s infinite;
          animation-delay: 3.9s;
        }
        
        /* Flow arrows animation */
        .flow-arrow-1 {
          opacity: 0;
          animation: flowArrow 6s infinite;
          animation-delay: 1.2s;
        }
        
        .flow-arrow-2 {
          opacity: 0;
          animation: flowArrow 6s infinite;
          animation-delay: 2.7s;
        }
      `}</style>
    </>
  );
} 