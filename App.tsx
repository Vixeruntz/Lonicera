import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HeroInput } from './components/HeroInput';
import { ArticleReader } from './components/ArticleReader';
import { ProcessingState } from './components/ProcessingState';
import { SettingsModal } from './components/SettingsModal';
import { LoadingState, ArticleData, AISettings } from './types';
import { Moon, Sun } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function App() {
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const [aiSettings, setAiSettings] = useState<AISettings>({
    provider: 'gemini',
    apiKey: '',
    baseUrl: '',
    modelName: ''
  });

  // Keep track of the raw text so we can incrementally parse it
  const [rawText, setRawText] = useState<string>('');

  useEffect(() => {
    // Load settings from localStorage
    const saved = localStorage.getItem('ai_settings');
    if (saved) {
        try { setAiSettings(JSON.parse(saved)); } catch (e) {}
    }

    // Check system preference on mount
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
       setIsDarkMode(true);
       document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleDarkMode = () => {
     setIsDarkMode(!isDarkMode);
     if (!isDarkMode) {
        document.documentElement.classList.add('dark');
     } else {
        document.documentElement.classList.remove('dark');
     }
  };

  const withRetry = async <T,>(operation: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> => {
      let lastError: any;
      for (let i = 0; i < retries; i++) {
          try {
              return await operation();
          } catch (e: any) {
              lastError = e;
              // Don't retry on user auth errors or 400 bad requests if they're identifiable
              if (e.message?.includes('401') || e.message?.includes('403') || e.message?.includes('400')) {
                  throw e;
              }
              // Add a randomized jitter so concurrent tasks don't all retry at the exact same millisecond
              const jitter = Math.random() * 1000;
              console.warn(`Retry ${i + 1}/${retries} failed: ${e.message}. Retrying in ${Math.round(delayMs + jitter)}ms...`);
              await sleep(delayMs + jitter);
              delayMs *= 2; // Exponential backoff
          }
      }
      throw lastError;
  };

  const parseRawText = (text: string, currentData: Partial<ArticleData>, originalUrl: string): ArticleData => {
    // Make regex more resilient to capitalization and markdown bolding
    const safeMatch = (pattern: RegExp) => (text.match(pattern)?.[1] || '').trim();
    
    let title = safeMatch(/\*{0,2}TITLE\*{0,2}:\s*(.*)/i) || '深度解读';
    let subtitle = safeMatch(/\*{0,2}SUBTITLE\*{0,2}:\s*(.*)/i) || '';
    let author = safeMatch(/\*{0,2}AUTHOR\*{0,2}:\s*(.*)/i) || 'Video Alchemist';
    let tagsStr = safeMatch(/\*{0,2}TAGS\*{0,2}:\s*(.*)/i) || '';
    let tags = tagsStr.split(',').map(s => s.replace(/[\*\[\]]/g, '').trim()).filter(Boolean);
    
    let contentMatch = text.match(/\*{0,2}CONTENT_START\*{0,2}\n([\s\S]*)/i);
    let content = contentMatch ? contentMatch[1] : '';

    // If CONTENT_START hasn't appeared yet but text is long, just use the whole text as fallback
    if (!content && text.length > 500) {
       content = text;
    }

    const estimatedReadingTime = Math.max(1, Math.ceil(content.length / 400));

    return {
      title,
      subtitle,
      author,
      tags: tags.length ? tags : ['深度阅读'],
      content,
      estimatedReadingTime: currentData.estimatedReadingTime || estimatedReadingTime,
      coverImageUrl: currentData.coverImageUrl,
      sourceUrl: originalUrl
    };
  };

  const handleAnalyze = useCallback(async (url: string) => {
    setLoadingState(LoadingState.SEARCHING);
    setArticle(null);
    setErrorMsg('');
    setRawText('');

    try {
      // Create unified clients
      let geminiClient: GoogleGenAI | null = null;
      const useOpenAI = aiSettings.provider === 'openai';

      if (useOpenAI) {
          if (!aiSettings.apiKey || !aiSettings.modelName) {
              throw new Error("如果使用自定义/第三方模型，API Key 和模型名称不能为空。请点击右上角齿轮配置。");
          }
      } else {
          geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      }

      // 1. Check Cache
      setLoadingState(LoadingState.SEARCHING);
      const cacheRes = await fetch(`/api/cache?video=${encodeURIComponent(url)}`);
      if (cacheRes.ok) {
          const contentType = cacheRes.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
              const { data } = await cacheRes.json();
              if (data) {
                  setArticle(data);
                  setLoadingState(LoadingState.COMPLETED);
                  window.scrollTo(0, 0);
                  return;
              }
          }
      }

      // 2. Fetch Transcript
      setLoadingState(LoadingState.ANALYZING);
      const transcriptRes = await fetch(`/api/transcript?video=${encodeURIComponent(url)}`);
      if (!transcriptRes.ok) {
          if (transcriptRes.status === 429) {
              throw new Error("解析字幕请求过于频繁 (限流保护)，请稍后再试。");
          } else {
              throw new Error(`视频无法处理 (Error ${transcriptRes.status}: ${transcriptRes.statusText})`);
          }
      }
      
      const transcriptContentType = transcriptRes.headers.get('content-type') || '';
      let transcript, title, author, error;
      if (transcriptContentType.includes('application/json')) {
          const tData = await transcriptRes.json();
          transcript = tData.transcript;
          title = tData.title;
          author = tData.author;
          error = tData.error;
      } else {
          transcript = "";
      }

      let safeTranscript = transcript ? transcript.substring(0, 30000) : ""; 

      let effectiveUseOpenAI = useOpenAI;
      let effectiveGeminiClient = geminiClient;
      
      // FALLBACK MECHANISM: If transcript is missing, third party OpenAI models will be blind and fail. 
      // We MUST dynamically fallback to Gemini (which has integrated Google Search) for this request.
      if (!safeTranscript && effectiveUseOpenAI) {
          console.warn("No transcript found and OpenAI/Custom provider selected. Falling back to built-in Gemini for internet search capability.");
          effectiveUseOpenAI = false;
          effectiveGeminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      }

      // 3. Phase 1: Editor Outlining
      setLoadingState(LoadingState.OUTLINING);
      // Wait shortly to avoid aggressive back-to-back api calls
      await sleep(1000);

      const editorInstruction = `You are a Senior Editor at The New Yorker magazine.
Analyze the video transcript and metadata to create a structured outline for a high-quality non-fiction column (纽约客专栏特稿) in Simplified Chinese.

CRITICAL INSTRUCTIONS:
1. STRUCTURE & PACE: Divide the content into logically cohesive chapters based on actual information density (2-4 chapters). Do not force length. Ensure a smooth, narrative-driven intellectual flow, avoiding stiff consulting-report structures.
2. CORE FOCUS: Preserve the creator's fundamental logic. Frame it as an engaging story or essay.
3. GOLDEN QUOTES (金句): Extract 1-3 precise, conversational quotes directly from the transcript per chapter. Instruct the writer to embed these like interview quotes.
4. SIDEBARS: Identify 2-3 specific concepts that require informative, witty, culturally/historically anchored context boxes (like a New Yorker insert).

ABSOLUTE MANDATE FOR MISSING CONTEXT:
If you cannot read the transcript or the transcript is missing, YOU MUST NEVER APOLOGIZE OR DECLINE.
You must immediately fall back to generating a highly profound, philosophical 3-chapter article outline based on the Video Title alone. 
YOU MUST ONLY OUTPUT THE RAW JSON. NO CONVERSATIONAL TEXT.

OUTPUT JSON EXACTLY MATCHING THIS FORMAT:
{
  "title": "<captivating title>",
  "subtitle": "<subtitle>",
  "author": "<author name based on video or 'Video Alchemist'>",
  "tags": ["tag1", "tag2"],
  "coverPrompt": "<prompt for cover image>",
  "chapters": [
    { "chapterTitle": "第一章：...", "instructions": "Write about..." }
  ],
  "sidebars": [
    { "term": "searchTerm", "context": "Why we need to explain this" }
  ]
}
`;
      
      // Build robust prompt using title/author fallback if needed
      let editorPrompt = `Video URL: ${url}\n`;
      if (title) editorPrompt += `Video Title: ${title}\n`;
      if (author) editorPrompt += `Channel/Author: ${author}\n\n`;
      if (safeTranscript) {
          editorPrompt += `<RAW_TRANSCRIPT>\n${safeTranscript}\n</RAW_TRANSCRIPT>`;
      } else {
          editorPrompt += `\n[SYSTEM NOTIFICATION]: No transcript is available. Please build the outline based purely on the Video Title and your pre-trained knowledge of the topic.`;
      }
      
      let outlineRaw = "{}";
      
      outlineRaw = await withRetry(async () => {
          if (effectiveUseOpenAI) {
              const res = await fetch('/api/ai/chat', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      apiKey: aiSettings.apiKey,
                      baseUrl: aiSettings.baseUrl,
                      model: aiSettings.modelName,
                      messages: [
                          { role: "system", content: editorInstruction },
                          { role: "user", content: editorPrompt }
                      ],
                      response_format: { type: "json_object" }
                  })
              });
              if (!res.ok) {
                  const errText = await res.text();
                  let errPayload;
                  try { errPayload = JSON.parse(errText); } catch(e) {}
                  throw new Error(errPayload?.error || `API connection error: ${res.status} ${res.statusText}`);
              }
              let payload;
              const ct = res.headers.get('content-type') || '';
              if (ct.includes('application/json')) {
                  payload = await res.json();
              } else {
                  const txt = await res.text();
                  try { payload = JSON.parse(txt); } catch(e) { payload = { content: txt }; }
              }
              return payload.content || "{}";
          } else if (effectiveGeminiClient) {
              const outlineRes = await effectiveGeminiClient.models.generateContent({
                  model: 'gemini-3.1-pro-preview',
                  contents: editorPrompt,
                  config: {
                      systemInstruction: editorInstruction,
                      responseMimeType: "application/json",
                      tools: [{googleSearch: {}}],
                      thinkingConfig: {thinkingBudget: 4096} // Restored thinking budget
                  }
              });
              return outlineRes.text || "{}";
          }
          return "{}";
      }, 3, 2000);

      let outlineData;
      try {
          // Double-Pointer robust regex extraction for JSON objects avoiding any extra markdown or AI conversation
          const jsonMatch = outlineRaw.match(/\{[\s\S]*\}/);
          let cleanedRaw = outlineRaw.trim();
          if (jsonMatch) {
              cleanedRaw = jsonMatch[0];
          }
          
          outlineData = JSON.parse(cleanedRaw);
      } catch (parseError) {
          console.error("JSON Parsing Error on Outline Phase:", parseError);
          console.error("Raw Output from AI:", outlineRaw);
          // FALLBACK TIER 2: If JSON is absolutely destroyed, we generate a hardcoded structural schema
          outlineData = {
             title: title || "视界深度解读",
             subtitle: "对核心逻辑的探讨与延展",
             author: author || "Video Alchemist",
             tags: ["深度思考", "知识复盘"],
             coverPrompt: `Abstract editorial conceptual art interpreting ${title || 'the topic'}`,
             chapters: [
                 { chapterTitle: "第一章：背景与核心逻辑", instructions: "详细解释视频中提出的核心问题和背景设定。" },
                 { chapterTitle: "第二章：关键论点剖析", instructions: "层层拆解视频的关键论据，无需逐字总结，要重在逻辑链条。" },
                 { chapterTitle: "第三章：深度延展与总结", instructions: "给出更高维度的总结和批判性思考。" }
             ],
             sidebars: []
          };
      }
      
      // FALLBACK TIER 3: Ensure critical schema properties exist to avoid runtime crashes
      if (!outlineData.chapters || !Array.isArray(outlineData.chapters)) {
           outlineData.chapters = [
               { chapterTitle: "深度解析", instructions: "请全面、深入、多角度地重写视频核心逻辑。" }
           ];
      }
      
      let currentArticleData: Partial<ArticleData> = {
          title: outlineData.title,
          subtitle: outlineData.subtitle,
          author: outlineData.author,
          tags: outlineData.tags,
      };

      // 4. Phase 2: Concurrent Drafting
      setLoadingState(LoadingState.DRAFTING);
      
      // We will concurrently build the markdown 
      setRawText(""); 
      
      // Asset Generation Background Task (Cover Image)
      let coverImagePromise = Promise.resolve('');
      if (outlineData.coverPrompt && geminiClient) {
          const safeCoverPrompt = `A high quality editorial illustration for an article. Theme: ${outlineData.coverPrompt.substring(0, 300)}. Empty background, minimalist.`;
          coverImagePromise = geminiClient.models.generateContent({
              model: 'gemini-2.5-flash-image', 
              contents: safeCoverPrompt,
              config: { imageConfig: { aspectRatio: "16:9" } }
          }).then(res => {
              const baseData = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
              return baseData ? `data:image/png;base64,${baseData}` : '';
          }).catch(e => {
              console.error("[Cover Background Gen Error]", e);
              return '';
          });
      }

      const numChapters = outlineData.chapters?.length || 0;
      const numSidebars = outlineData.sidebars?.length || 0;
      const chapterTexts: string[] = new Array(numChapters).fill("");
      const sidebarTexts: string[] = new Array(numSidebars).fill("");

      const buildCurrentMarkdown = () => {
          let md = `*TITLE: ${outlineData.title}*\n`;
          md += `*SUBTITLE: ${outlineData.subtitle}*\n`;
          md += `*AUTHOR: ${outlineData.author}*\n`;
          md += `*TAGS: ${outlineData.tags?.join(', ')}*\n`;
          md += `*COVER_PROMPT: ${outlineData.coverPrompt}*\n`;
          md += `*CONTENT_START*\n\n`;
          
          for (let i = 0; i < numChapters; i++) {
              if (chapterTexts[i]) md += chapterTexts[i] + "\n\n";
          }
          for (let i = 0; i < numSidebars; i++) {
              if (sidebarTexts[i]) md += sidebarTexts[i] + "\n\n";
          }
          return md;
      };

      let rafId: number | null = null;
      const throttledUpdateUI = () => {
          if (!rafId) {
              rafId = requestAnimationFrame(() => {
                  const md = buildCurrentMarkdown();
                  setRawText(md);
                  setArticle(parseRawText(md, currentArticleData, url));
                  rafId = null;
              });
          }
      };

      // Set it once so it's visible while streaming starts
      throttledUpdateUI();
      setLoadingState(LoadingState.STREAMING);

      const chapterTasks = (outlineData.chapters || []).map(async (chapter: any, idx: number) => {
        // Stagger requests slightly to avoid literal simultaneous burst limits
        await sleep(idx * 600);
        
        const writerInstruction = `You are a Staff Writer for The New Yorker magazine.
Write a chapter for an engaging, non-fiction column deep-dive.

YOUR TASK:
Write the chapter titled "${chapter.chapterTitle}".
Instructions for this chapter: ${chapter.instructions}

CRITICAL RULES:
1. THE NEW YORKER STYLE: Conversational, highly readable, smooth, and intellectually engaging. It must flow like an interesting story told by a smart friend. 
2. NO CONSULTING REPORTS: Avoid stiff phrasing, robotic bullet points, or dry academic summaries. 
3. THE 90/10 RULE: 90% plain, clear, and engaging factual narrative. 10% sharp wit or insightful metaphors. Strictly NO flowery, overly dramatic AI-cliches (e.g., "画卷", "奏响乐章", "命运的齿轮", "交织").
4. RESPECT ORIGINAL: Weave the arguments naturally. Embed the requested golden quotes (金句原文) seamlessly as if quoting an interview subject.
5. CONCISE DEPTH: Let logic and narrative dictate length. Do not pad words.
6. Output ONLY the markdown content for this chapter (start with an h2 ## ${chapter.chapterTitle}). Write in Simplified Chinese.`;

        let writerPrompt = `Video URL: ${url}\n`;
        if (title) writerPrompt += `Video Title: ${title}\n`;
        if (safeTranscript) {
            writerPrompt += `Video Context: \n${safeTranscript}`;
        } else {
            writerPrompt += `[SYSTEM NOTIFICATION]: No direct transcript. Write purely based on the instructions, title, and your world knowledge.`;
        }

        await withRetry(async () => {
            if (effectiveUseOpenAI) {
                const res = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        apiKey: aiSettings.apiKey,
                        baseUrl: aiSettings.baseUrl,
                        model: aiSettings.modelName,
                        messages: [
                            { role: "system", content: writerInstruction },
                            { role: "user", content: writerPrompt }
                        ],
                        stream: true
                    })
                });
                
                if (!res.ok) {
                    const errText = await res.text();
                    let errPayload;
                    try { errPayload = JSON.parse(errText); } catch(e) {}
                    throw new Error(errPayload?.error || `Stream connection error: ${res.status}`);
                }

                const reader = res.body?.getReader();
                const decoder = new TextDecoder("utf-8");

                if (reader) {
                    let buffer = "";
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || ""; 
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const dataStr = line.substring(6).trim();
                                if (dataStr === '[DONE]') continue;
                                if (dataStr) {
                                    try {
                                        const data = JSON.parse(dataStr);
                                        if (data.text) {
                                            chapterTexts[idx] += data.text;
                                            throttledUpdateUI();
                                        }
                                    } catch(e) {}
                                }
                            }
                        }
                    }
                }
            } else if (effectiveGeminiClient) {
                const writerRes = await effectiveGeminiClient.models.generateContentStream({
                    model: 'gemini-3.1-pro-preview',
                    contents: writerPrompt,
                    config: {
                        systemInstruction: writerInstruction,
                        // Focus on writing speed (Asymmetric allocation: less thinking, more output)
                        thinkingConfig: {thinkingBudget: 1024}, 
                    }
                });

                for await (const chunk of writerRes) {
                    if (chunk.text) {
                        chapterTexts[idx] += chunk.text;
                        throttledUpdateUI();
                    }
                }
            }
        }, 3, 1500).catch(e => {
            console.error(`Chapter ${idx} writer error:`, e);
            chapterTexts[idx] = `\n\n*(注：本章节因 API 并发限制自动降级/生成失败)*\n\n`;
            throttledUpdateUI();
        });
      });

      const sidebarTasks = (outlineData.sidebars || []).map(async (sb: any, idx: number) => {
          // Stagger sidebars to start slightly after chapters to prevent massive instant burst
          await sleep(numChapters * 600 + idx * 600);
          
          const sbInstruction = `You are a contributing writer for The New Yorker.
Write a professional context box (深度延伸) about: ${sb.term}.
Context: ${sb.context}.

CRITICAL INSTRUCTIONS:
- Provide factual, historical, or scientific context in a clear, witty, and highly readable narrative style.
- Avoid dramatic "historical destiny" clichés. Keep it unpretentious, smooth, and informative. No dry Wikipedia dumps and NO stiff report formats.
- Use Google Search to ensure factual accuracy. Return markdown format starting with ### 深度延伸：${sb.term}.`;
          
          sidebarTexts[idx] += `\n\n---\n\n`;

          await withRetry(async () => {
              if (effectiveUseOpenAI) {
                  const res = await fetch('/api/ai/chat', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          apiKey: aiSettings.apiKey,
                          baseUrl: aiSettings.baseUrl,
                          model: aiSettings.modelName,
                          messages: [
                              { role: "user", content: sbInstruction }
                          ],
                          stream: true
                      })
                  });
                  
                  if (!res.ok) {
                      const errText = await res.text();
                      let errPayload;
                      try { errPayload = JSON.parse(errText); } catch(e) {}
                      throw new Error(errPayload?.error || `Stream connection error: ${res.status}`);
                  }
  
                  const reader = res.body?.getReader();
                  const decoder = new TextDecoder("utf-8");
  
                  if (reader) {
                      let buffer = "";
                      while (true) {
                          const { done, value } = await reader.read();
                          if (done) break;
                          buffer += decoder.decode(value, { stream: true });
                          const lines = buffer.split('\n');
                          buffer = lines.pop() || ""; 
                          for (const line of lines) {
                              if (line.startsWith('data: ')) {
                                  const dataStr = line.substring(6).trim();
                                  if (dataStr === '[DONE]') continue;
                                  if (dataStr) {
                                      try {
                                          const data = JSON.parse(dataStr);
                                          if (data.text) {
                                              sidebarTexts[idx] += data.text;
                                              throttledUpdateUI();
                                          }
                                      } catch(e) {}
                                  }
                              }
                          }
                      }
                  }
              } else if (effectiveGeminiClient) {
                  const sbRes = await effectiveGeminiClient.models.generateContentStream({
                      model: 'gemini-3.1-pro-preview',
                      contents: sbInstruction,
                      config: { tools: [{googleSearch: {}}] }
                  });
                  for await (const chunk of sbRes) {
                      if (chunk.text) {
                          sidebarTexts[idx] += chunk.text;
                          throttledUpdateUI();
                      }
                  }
              }
          }, 2, 2000).catch(e => {
              console.error("Sidebar error:", e);
              sidebarTexts[idx] += `*(延伸内容获取失败)*`;
              throttledUpdateUI();
          });
          
          sidebarTexts[idx] += `\n\n---\n\n`;
          throttledUpdateUI();
      });

      // AWAIT ALL TASKS CONCURRENTLY!
      await Promise.all([...chapterTasks, ...sidebarTasks]);

      // 5. Finalize and Cache
      setLoadingState(LoadingState.POLISHING);
      const accumulatedText = buildCurrentMarkdown();
      const finalCoverUrl = await coverImagePromise;

      currentArticleData.coverImageUrl = finalCoverUrl;
      currentArticleData.estimatedReadingTime = Math.ceil(accumulatedText.length / 400);
      const finalArticle = parseRawText(accumulatedText, currentArticleData, url);
      setArticle(finalArticle);
      setLoadingState(LoadingState.COMPLETED);

      await fetch('/api/cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl: url, cacheData: { ...finalArticle, createdAt: Date.now() } })
      }).catch(e => console.error("Cache save fail:", e));

    } catch (error: any) {
      console.error("Deep Read Task Error:", error);
      let errorStr = error?.message || '未知系统异常';
      if (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED')) {
          errorStr = "触发了 AI 额度限制。因为长文模式每次消耗近万字算力，请等待几分钟后重试。";
      }
      setErrorMsg("处理失败：" + errorStr);
      setLoadingState(LoadingState.ERROR);
    }
  }, [aiSettings]);

  const handleBack = () => {
    setLoadingState(LoadingState.IDLE);
    setArticle(null);
    // Clear URL param when going back
    const url = new URL(window.location.href);
    url.searchParams.delete('video');
    window.history.pushState({}, '', url);
  };

  // Check for 'video' query param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const videoUrl = params.get('video');
    if (videoUrl && loadingState === LoadingState.IDLE) {
      handleAnalyze(videoUrl);
    }
  }, []); // Run only once on mount

  const handleSaveSettings = (newSettings: AISettings) => {
    setAiSettings(newSettings);
    localStorage.setItem('ai_settings', JSON.stringify(newSettings));
  };

  const isReading = !!article && loadingState !== LoadingState.ERROR;

  return (
    <div className="min-h-screen bg-paper text-ink transition-colors duration-500 overflow-x-hidden selection:bg-accent/20 selection:text-ink">
      
      {/* Settings Modal */}
      <SettingsModal settings={aiSettings} onSave={handleSaveSettings} isReading={isReading} />

      {/* Dark mode toggle (hidden during reading, handled by reader nav instead if we want) */}
      {!isReading && (
          <button 
            onClick={toggleDarkMode}
            className="fixed top-6 right-6 z-50 p-2 rounded-full border border-stone-200/50 bg-paper/50 backdrop-blur-sm text-stone-500 hover:text-ink transition-all shadow-sm print:hidden"
            title="Toggle Theme"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
      )}

      <AnimatePresence mode="wait">
        {loadingState === LoadingState.IDLE && (
          <motion.div 
            key="hero"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20, filter: "blur(4px)" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="w-full"
          >
            <HeroInput onAnalyze={handleAnalyze} loadingState={loadingState} />
            <footer className="fixed bottom-6 left-0 right-0 text-center text-xs text-stone-400 font-sans tracking-wide">
               由 GEMINI 3.1 PRO 驱动
            </footer>
          </motion.div>
        )}

        {(loadingState !== LoadingState.IDLE && (!article || loadingState === LoadingState.ERROR)) && (
          <motion.div 
            key="processing"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className={`w-full absolute inset-0 flex items-center justify-center z-50 ${loadingState === LoadingState.ERROR ? 'pointer-events-auto' : 'pointer-events-none'}`}
          >
            <ProcessingState state={loadingState} errorMessage={errorMsg} />
          </motion.div>
        )}

        {(!!article && loadingState !== LoadingState.ERROR) && (
          <motion.div 
            key="reader"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="w-full relative z-10"
          >
            <ArticleReader 
                data={article} 
                onBack={handleBack} 
                isStreaming={loadingState === LoadingState.STREAMING} 
                isPolishing={loadingState === LoadingState.POLISHING} 
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}