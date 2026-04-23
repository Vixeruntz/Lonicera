import React, { useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { toPng } from 'html-to-image';
import { ArticleData } from '../types';
import { Clock, ArrowLeft, Youtube, Sparkles, Image as ImageIcon, FileText, Share2, MoreHorizontal, Check, List } from 'lucide-react';

interface ArticleReaderProps {
  data: ArticleData;
  onBack: () => void;
  isStreaming?: boolean;
  isPolishing?: boolean;
}

export const ArticleReader: React.FC<ArticleReaderProps> = ({ data, onBack, isStreaming, isPolishing }) => {
  const articleRef = useRef<HTMLElement>(null);
  const endOfContentRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [showNav, setShowNav] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showExports, setShowExports] = useState(false);
  const [headings, setHeadings] = useState<{ id: string, text: string, level: number }[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string>('');

  // Extract headings for TOC
  useEffect(() => {
     if (isStreaming) return;
     const matches = Array.from(data.content.matchAll(/^(#{2,3})\s+(.*)$/gm));
     if (matches.length > 0) {
         const extracted = matches.map((m) => {
             const text = m[2].replace(/[\*\_]/g, '');
             const id = `h-${text.replace(/\s+/g, '-').toLowerCase()}`;
             return { id, text, level: m[1].length };
         });
         setHeadings(extracted);
     }
  }, [data.content, isStreaming]);

  // Handle active heading on scroll
  useEffect(() => {
     if (isStreaming || headings.length === 0) return;
     const handleScroll = () => {
         let currentActive = headings[0]?.id;
         for (const h of headings) {
             const el = document.getElementById(h.id);
             if (el) {
                 const rect = el.getBoundingClientRect();
                 if (rect.top < 150) {
                     currentActive = h.id;
                 }
             }
         }
         setActiveHeadingId(currentActive);
     };
     window.addEventListener('scroll', handleScroll, { passive: true });
     return () => window.removeEventListener('scroll', handleScroll);
  }, [headings, isStreaming]);

  // Auto-scroll logic during streaming
  useEffect(() => {
    if (isStreaming && endOfContentRef.current) {
        endOfContentRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [data.content, isStreaming]);

  // Hide nav on scroll down
  useEffect(() => {
     if (isStreaming) return; // Keep nav visible if streaming
     const handleScroll = () => {
         const currentScrollY = window.scrollY;
         if (currentScrollY > lastScrollY && currentScrollY > 100) {
             setShowNav(false);
             setShowExports(false);
         } else {
             setShowNav(true);
         }
         setLastScrollY(currentScrollY);
     };

     window.addEventListener('scroll', handleScroll, { passive: true });
     return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY, isStreaming]);

  const handleShare = async () => {
     try {
         await navigator.clipboard.writeText(window.location.href);
         setCopied(true);
         setTimeout(() => setCopied(false), 2000);
     } catch (e) {}
  };

  const handleDownloadImage = async () => {
    if (articleRef.current === null) return;
    setIsDownloading(true);
    try {
      const imageWidth = 800;
      const dataUrl = await toPng(articleRef.current, {
        cacheBust: true,
        backgroundColor: '#f9f7f1', // Always export using paper color to maintain reading style
        pixelRatio: 1.5,
        width: imageWidth,
        style: {
            margin: '0', maxWidth: 'none', width: '100%', height: 'auto', padding: '40px', transform: 'none',
        }
      });
      const link = document.createElement('a');
      link.download = `${data.title.replace(/\s+/g, '_').slice(0, 20)}_DeepRead.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      alert('抱歉，生成图片时出现错误，请重试。');
    } finally {
      setIsDownloading(false);
      setShowExports(false);
    }
  };

   const handleDownloadPdf = () => {
    if (articleRef.current === null) return;
    setIsDownloadingPdf(true);
    const element = articleRef.current;
    
    // Temporarily remove dark mode class for the export clone so it exports in reading color
    const wasDark = document.documentElement.classList.contains('dark');
    if (wasDark) document.documentElement.classList.remove('dark');

    const opt = {
        margin:       [15, 15, 15, 15],
        filename:     `${data.title.replace(/\s+/g, '_').slice(0, 20)}_DeepRead.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, scrollY: 0 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
    };
    setTimeout(() => {
        // @ts-ignore
        if (typeof window.html2pdf === 'function') {
             // @ts-ignore
             window.html2pdf().set(opt).from(element).save()
             .then(() => { setIsDownloadingPdf(false); setShowExports(false); if(wasDark) document.documentElement.classList.add('dark'); })
             .catch((err: any) => { setIsDownloadingPdf(false); alert('PDF 生成失败，请重试。'); if(wasDark) document.documentElement.classList.add('dark'); });
        } else {
             setIsDownloadingPdf(false);
             alert('PDF 组件加载失败');
             if(wasDark) document.documentElement.classList.add('dark');
        }
    }, 100);
  };

  const handleDownloadMarkdown = () => {
    try {
      const markdownContent = `# ${data.title}\n\n**${data.subtitle}**\n\n> 作者：${data.author}\n> 阅读时间：约 ${data.estimatedReadingTime} 分钟\n\n---\n\n${data.content}\n\n---\n\n*视频原出处：${data.sourceUrl}*\n*由视频炼金术 (Video Alchemist) 生成*`;
      const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${data.title.replace(/\s+/g, '_').slice(0, 20)}_公众号排版使用.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setShowExports(false);
    } catch (err) {
      alert('Markdown 生成失败，请重试。');
    }
  };

  const generateIdFromChildren = (children: any) => {
     const text = React.Children.toArray(children).join('').replace(/[\*\_]/g, '');
     return `h-${text.replace(/\s+/g, '-').toLowerCase()}`;
  };

  return (
    <div className="min-h-screen animate-fade-in pb-24 flex justify-center">
      
      {/* Table of Contents - Floating Sidebar (Desktop Only) */}
      {!isStreaming && headings.length > 0 && (
         <aside className="hidden xl:block fixed left-[max(0px,calc(50%-460px-220px))] top-32 w-[200px] h-[calc(100vh-128px)] overflow-y-auto print:hidden">
             <div className="pl-4 border-l border-stone-200/50">
                 <div className="flex items-center space-x-2 text-stone-400 mb-6 font-sans text-xs font-semibold uppercase tracking-widest">
                     <List className="w-3 h-3" />
                     <span>Contents</span>
                 </div>
                 <nav className="space-y-3">
                     {headings.map(h => (
                         <a 
                            key={h.id} 
                            href={`#${h.id}`}
                            onClick={(e) => {
                                e.preventDefault();
                                document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className={`block font-sans text-sm transition-all duration-300 ${activeHeadingId === h.id ? 'text-accent font-medium -translate-x-1' : 'text-stone-400 hover:text-ink'} ${h.level === 3 ? 'ml-3 text-xs' : ''}`}
                         >
                             {h.text}
                         </a>
                     ))}
                 </nav>
             </div>
         </aside>
      )}

      {/* Navigation - Minimalist & Hide on Scroll */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-in-out print:hidden ${showNav ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="absolute inset-0 bg-paper/80 backdrop-blur-md border-b border-stone-200/50 shadow-sm transition-colors duration-500" />
        <div className="relative max-w-screen-xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <button 
            onClick={onBack}
            className="flex items-center space-x-2 text-stone-500 hover:text-ink transition-colors group px-2 py-1 rounded-md hover:bg-stone-100/50"
          >
            <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" />
            <span className="hidden md:inline font-sans text-[11px] tracking-widest font-semibold uppercase">Library</span>
          </button>
          
          <div className="flex items-center space-x-1 md:space-x-3">
             <button 
                onClick={handleShare}
                className="flex items-center space-x-2 px-4 py-1.5 rounded-full bg-ink text-paper hover:bg-stone-800 dark:hover:bg-stone-300 transition-colors shadow-sm"
                title="Copy Link to Share"
             >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                <span className="text-[11px] font-sans font-semibold tracking-widest uppercase">
                    {copied ? 'Copied' : 'Share'}
                </span>
             </button>

             <button 
                onClick={() => {
                    document.documentElement.classList.toggle('dark');
                    // To sync with local storage if desired
                    const isDark = document.documentElement.classList.contains('dark');
                    localStorage.setItem('theme', isDark ? 'dark' : 'light');
                }}
                className="flex items-center justify-center p-2 rounded-full border border-transparent hover:border-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all text-stone-600 dark:text-stone-300"
                title="Toggle Dark Mode"
             >
                  {/* Simplistic icons here, we'll use a generic sun/moon toggle approach assuming class manipulation works globally */}
                  <span className="w-5 h-5 flex items-center justify-center opacity-80 hover:opacity-100">◑</span>
             </button>

             <div className="relative">
                 <button 
                    onClick={() => setShowExports(!showExports)}
                    disabled={isStreaming}
                    className="flex items-center justify-center p-2 rounded-full border border-transparent hover:border-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all disabled:opacity-30 text-stone-600 dark:text-stone-300"
                    title="Export Options"
                 >
                    <MoreHorizontal className="w-5 h-5" />
                 </button>

                 {showExports && (
                     <div className="absolute right-0 mt-2 w-40 bg-paper border border-stone-100 dark:border-stone-800 shadow-xl rounded-xl overflow-hidden py-1 animate-fade-in-up z-50">
                         <button onClick={handleDownloadImage} disabled={isDownloading || isDownloadingPdf} className="w-full flex items-center px-4 py-2.5 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 font-sans text-xs font-semibold tracking-wide uppercase transition-colors">
                            {isDownloading ? <div className="w-3.5 h-3.5 mr-3 border-2 border-stone-300 border-t-ink rounded-full animate-spin" /> : <ImageIcon className="w-3.5 h-3.5 mr-3" />} PNG Image
                         </button>
                         <button onClick={handleDownloadPdf} disabled={isDownloading || isDownloadingPdf} className="w-full flex items-center px-4 py-2.5 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 font-sans text-xs font-semibold tracking-wide uppercase transition-colors">
                            {isDownloadingPdf ? <div className="w-3.5 h-3.5 mr-3 border-2 border-stone-300 border-t-ink rounded-full animate-spin" /> : <FileText className="w-3.5 h-3.5 mr-3" />} PDF Doc
                         </button>
                         <button onClick={handleDownloadMarkdown} disabled={isDownloading || isDownloadingPdf} className="w-full flex items-center px-4 py-2.5 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 font-sans text-xs font-semibold tracking-wide uppercase transition-colors">
                            <FileText className="w-3.5 h-3.5 mr-3" /> Markdown
                         </button>
                     </div>
                 )}
             </div>
          </div>
        </div>
      </nav>

      {/* The Article Container to Capture */}
      <article ref={articleRef} className="w-[100vw] max-w-[720px] px-6 pt-24 md:pt-32">
        
        {/* Editorial Header */}
        <header className="mb-14 text-center">
            {/* Tagline / Kicker */}
            <div className="flex items-center justify-center space-x-3 text-accent mb-8">
                {data.tags.slice(0, 1).map(tag => (
                    <span key={tag} className="font-sans text-xs font-bold tracking-[0.2em] uppercase text-accent relative px-4 py-1">
                        <span className="absolute inset-0 border border-accent/20 transform -skew-x-12"></span>
                        <span className="relative z-10">{tag}</span>
                    </span>
                ))}
            </div>
            
            {/* Title */}
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-ink font-bold leading-tight md:leading-[1.15] mb-6 tracking-tight transition-colors duration-500">
                {data.title}
            </h1>
            
            {/* Subtitle */}
            <p className="font-sans text-lg md:text-xl text-stone-500 dark:text-stone-400 font-light mb-10 max-w-xl mx-auto leading-relaxed transition-colors duration-500">
                {data.subtitle}
            </p>

            {/* Byline */}
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 text-xs font-sans tracking-widest text-stone-400 dark:text-stone-500 border-t border-b border-stone-200/60 dark:border-stone-800 py-5 max-w-lg mx-auto uppercase transition-colors duration-500">
                <span className="flex items-center">
                    <span className="text-stone-400 mr-2">AUTHOR</span>
                    <span className="text-ink font-bold transition-colors duration-500">{data.author}</span>
                </span>
                <span className="hidden md:block w-px h-3 bg-stone-300 dark:bg-stone-700 transition-colors"></span>
                <span className="flex items-center">
                    <Clock className="w-3 h-3 mr-2 text-stone-400" />
                    {data.estimatedReadingTime} MIN READ
                </span>
            </div>
        </header>

        {/* Cover Image - Full Bleed on Mobile, Rounded on Desktop */}
        {data.coverImageUrl ? (
            <figure className="mb-16 -mx-6 md:-mx-0 relative group animate-fade-in">
                <div className="aspect-[21/9] md:aspect-[2/1] w-full overflow-hidden shadow-sm md:rounded-sm bg-stone-100 dark:bg-stone-900 transition-colors">
                    <img 
                        src={data.coverImageUrl} 
                        alt="Chapter Cover" 
                        className="w-full h-full object-cover filter brightness-[0.98] contrast-[1.02] dark:brightness-90 transition-all duration-500"
                    />
                </div>
                <figcaption className="mt-3 text-center md:text-right">
                    <span className="inline-flex items-center text-[10px] text-stone-400 font-sans tracking-widest uppercase opacity-70">
                        <Sparkles className="w-2.5 h-2.5 mr-1" /> AI Illustration
                    </span>
                </figcaption>
            </figure>
        ) : (
            isPolishing && (
               <figure className="mb-16 -mx-6 md:-mx-0 relative group">
                <div className="aspect-[21/9] md:aspect-[2/1] w-full overflow-hidden shadow-sm md:rounded-sm bg-stone-100 dark:bg-stone-800 transition-colors relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-stone-100 via-stone-200 to-stone-100 dark:from-stone-800 dark:via-stone-700 dark:to-stone-800 animate-pulse bg-[length:200%_100%] transition-colors duration-500"></div>
                    <div className="absolute inset-0 flex items-center justify-center text-stone-400">
                        <span className="font-sans text-xs tracking-widest uppercase flex items-center">
                            <Sparkles className="w-3 h-3 mr-2 animate-spin" /> 
                            Painting Cover Illustration...
                        </span>
                    </div>
                </div>
              </figure>
            )
        )}

        {/* Content Body - The "New Yorker" Style */}
        <div className="
            prose prose-lg md:prose-xl prose-stone mx-auto transition-colors duration-500
            prose-headings:font-sans prose-headings:font-bold prose-headings:tracking-tighter prose-headings:text-ink
            prose-h2:text-3xl prose-h2:mt-16 prose-h2:mb-6
            prose-h3:text-2xl prose-h3:mt-12 prose-h3:mb-4
            prose-p:font-serif prose-p:text-ink prose-p:leading-8 prose-p:text-justify
            prose-a:text-accent prose-a:no-underline prose-a:border-b prose-a:border-accent/30 hover:prose-a:border-accent prose-a:transition-all
            prose-blockquote:border-l-2 prose-blockquote:border-accent prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:font-serif prose-blockquote:text-stone-500 dark:prose-blockquote:text-stone-400 prose-blockquote:bg-transparent
            prose-strong:font-bold prose-strong:text-ink
            prose-li:font-serif prose-li:text-ink
            
            /* First Letter Drop Cap Logic */
            [&>p:first-of-type]:first-letter:text-6xl
            [&>p:first-of-type]:first-letter:font-bold
            [&>p:first-of-type]:first-letter:text-ink
            [&>p:first-of-type]:first-letter:mr-3
            [&>p:first-of-type]:first-letter:float-left
            [&>p:first-of-type]:first-letter:leading-[0.8]
            [&>p:first-of-type]:first-letter:mt-1
            [&>p:first-of-type]:first-letter:font-serif
        ">
            <ReactMarkdown
               components={{
                   h2: ({node, ...props}) => <h2 id={generateIdFromChildren(props.children)} className="scroll-mt-24" {...props} />,
                   h3: ({node, ...props}) => <h3 id={generateIdFromChildren(props.children)} className="scroll-mt-24" {...props} />,
               }}
            >
               {data.content}
            </ReactMarkdown>
            
            {/* Blinking Cursor for Streaming */}
            {isStreaming && (
                <span className="inline-block w-2.5 h-6 bg-accent opacity-70 animate-pulse align-middle ml-1 -mt-1 rounded-sm"></span>
            )}
        </div>

        {/* Auto-scroll target */}
        <div ref={endOfContentRef} className="h-8" />

        {/* Editorial Footer / End Mark */}
        {(!isStreaming) && (
            <div className="mt-24 flex justify-center animate-fade-in-up">
                <span className="text-2xl text-stone-300 dark:text-stone-700 font-serif transition-colors">❦</span>
            </div>
        )}

        {/* Source Link */}
        <div className="mt-12 pt-12 border-t border-stone-200 dark:border-stone-800 pb-12 transition-colors">
            <div className="bg-white/50 dark:bg-black/20 border border-stone-100 dark:border-stone-800 rounded-lg p-6 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left transition-colors">
                <div>
                    <h4 className="font-sans font-bold text-sm text-ink mb-1 transition-colors">Source Material</h4>
                    <p className="font-serif text-sm text-stone-500 dark:text-stone-400 italic transition-colors">Adapted from the original video content.</p>
                </div>
                {/* We render the link but it might not be clickable in a static image, which is fine */}
                <div className="flex items-center text-ink font-semibold space-x-2 transition-colors overflow-hidden max-w-full">
                    <Youtube className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm font-sans truncate">{data.sourceUrl}</span>
                </div>
            </div>
            
            <div className="mt-8 text-center">
                 <p className="text-[10px] text-stone-300 dark:text-stone-600 font-sans tracking-[0.2em] uppercase transition-colors">
                    Generated by Video Alchemist
                 </p>
            </div>
        </div>
      </article>
    </div>
  );
};