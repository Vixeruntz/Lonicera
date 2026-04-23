import React, { useEffect, useState } from 'react';
import { LoadingState } from '../types';
import { Loader2, Search, Brain, PenTool, Sparkles } from 'lucide-react';

interface ProcessingStateProps {
  state: LoadingState;
  errorMessage?: string;
}

const TIPS = [
  "任何足够先进的科技，都与魔法无异。 —— 亚瑟·克拉克",
  "不要温顺地走进那个良夜…… 怒斥，怒斥那光明的消逝。 —— 迪兰·托马斯",
  "你无法在展望未来时串联点滴，只有在回顾过去时才能将它们联系起来。 —— 史蒂夫·乔布斯",
  "我思故我在。 —— 勒内·笛卡尔",
  "未来属于那些相信自己梦之美的人。 —— 埃莉诺·罗斯福",
  "生存还是毁灭，这是一个问题。 —— 威廉·莎士比亚",
  "软件正在吞噬世界。 —— 马克·安德森",
  "我们从不预测未来，我们创造未来。 —— 艾伦·凯伊",
  "人生而自由，却无往不在枷锁之中。 —— 让-雅克·卢梭"
];

export const ProcessingState: React.FC<ProcessingStateProps> = ({ state, errorMessage }) => {
  const [dots, setDots] = useState('');
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);

    const tipInterval = setInterval(() => {
        setTipIndex(prev => (prev + 1) % TIPS.length);
    }, 6000);

    // Fake progress that slows down
    const progressInterval = setInterval(() => {
        setProgress(prev => {
            if (prev < 30) return prev + 2;
            if (prev < 70) return prev + 0.8;
            if (prev < 90) return prev + 0.2;
            if (prev < 96) return prev + 0.05;
            return prev;
        });
    }, 200);

    return () => {
        clearInterval(dotInterval);
        clearInterval(tipInterval);
        clearInterval(progressInterval);
    };
  }, []);

  const steps = [
    { id: LoadingState.SEARCHING, label: '正在全网检索信息以充实知识图谱', icon: Search },
    { id: LoadingState.ANALYZING, label: '提取视频原片并构建多模态语义树', icon: Brain },
    { id: LoadingState.OUTLINING, label: '主编 AI 正在推演具有戏剧张力的文章大纲', icon: PenTool },
    { id: LoadingState.DRAFTING, label: '万字写作流：数位专栏 AI 并发分形撰写章节', icon: Sparkles },
  ];

  let currentStepIndex = steps.findIndex(s => s.id === state);
  if ([LoadingState.STREAMING, LoadingState.POLISHING, LoadingState.COMPLETED].includes(state)) {
      currentStepIndex = 4;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] w-full max-w-md mx-auto px-6 animate-fade-in-up">
      <div className="w-full mb-10">
          <div className="h-1 w-full bg-stone-100 rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-ink transition-all duration-300 ease-out"
                style={{ width: `${state === LoadingState.ERROR ? 100 : progress}%`, backgroundColor: state === LoadingState.ERROR ? '#ef4444' : '' }}
              />
          </div>
          <div className="mt-4 text-center h-4">
              <p className="text-xs text-stone-400 font-sans tracking-wide animate-fade-in transition-opacity">
                  {state !== LoadingState.ERROR && TIPS[tipIndex]}
              </p>
          </div>
      </div>

      <div className="w-full space-y-8 relative">
        <div className="absolute left-5 top-8 bottom-8 w-px bg-stone-200 -z-10" />

        {steps.map((step, index) => {
          const isActive = step.id === state;
          const isCompleted = currentStepIndex > index;
          const isPending = currentStepIndex < index;
          
          return (
            <div 
              key={step.id} 
              className={`flex items-center space-x-4 transition-all duration-500 ${isPending ? 'opacity-30' : 'opacity-100'}`}
            >
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 bg-paper
                ${isActive ? 'border-ink text-ink scale-110 shadow-sm' : ''}
                ${isCompleted ? 'border-ink bg-ink text-white' : ''}
                ${isPending ? 'border-stone-200 text-stone-300' : ''}
              `}>
                {isActive ? (
                    <step.icon className="w-4 h-4 animate-pulse" />
                ) : (
                    <step.icon className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1">
                <h3 className={`font-sans font-medium text-lg tracking-tight ${isActive ? 'text-ink' : 'text-stone-400'}`}>
                  {step.label}
                  {isActive && <span className="inline-block w-8 text-left">{dots}</span>}
                </h3>
              </div>
            </div>
          );
        })}
      </div>
      
      {state === LoadingState.ERROR && (
        <div className="mt-8 p-4 bg-red-50 text-red-800 rounded-lg text-sm text-center border border-red-100 flex flex-col gap-3 shadow-sm w-full">
           <span className="font-semibold">提取中止</span>
           <span className="opacity-90 leading-relaxed">可能是视频无法访问、不包含语音轨，或者超出了单次回忆额度。</span>
           {errorMessage && (
             <div className="p-2 bg-white/50 rounded-md font-mono text-[10px] opacity-70 break-all text-left">
                 {errorMessage}
             </div>
           )}
           <button onClick={() => window.location.reload()} className="mt-2 px-4 py-2 bg-red-800 text-white rounded-md text-xs font-semibold hover:bg-red-900 transition-colors">
               返回首页
           </button>
        </div>
      )}
    </div>
  );
};