import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Maximize2, X, ChevronRight, ExternalLink, Link as LinkIcon, Eye, Edit3, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Satisfaction } from '../../types';

export function openExternalUrl(url: string) {
  if (!url) return;
  const clean = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const newWin = window.open(clean, '_blank', 'noopener,noreferrer');
    if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
      // Fallback si popup bloqué par l'iframe
      const a = document.createElement('a');
      a.href = clean;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch {
    window.location.href = clean;
  }
}

/**
 * Rendu sécurisé du texte supportant les hyperliens Markdown [texte](url) avec ou sans espaces,
 * ainsi que les URLs brutes (https://...).
 */
export function RenderRichText({ content, className = '' }: { content: string; className?: string }) {
  if (!content) return null;

  // Regex acceptant [texte] (url) ou [texte](url) ou url nue
  const regex = /\[([^\]]+)\]\s*\(((?:https?:\/\/|\/)[^\s)]+)\)|(https?:\/\/[^\s<]+)/gi;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      elements.push(content.substring(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      const linkText = match[1].trim();
      const linkUrl = match[2].trim();
      elements.push(
        <button
          key={`md-${match.index}`}
          type="button"
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            openExternalUrl(linkUrl);
          }}
          className="text-primary font-bold underline inline-flex items-center gap-1 hover:text-primary-dark transition-colors cursor-pointer"
          title={`Ouvrir le lien : ${linkUrl}`}
        >
          <span>{linkText}</span>
          <ExternalLink className="w-3.5 h-3.5 inline-block shrink-0" />
        </button>
      );
    } else if (match[3]) {
      const rawUrl = match[3].trim();
      elements.push(
        <button
          key={`raw-${match.index}`}
          type="button"
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            openExternalUrl(rawUrl);
          }}
          className="text-primary font-bold underline inline-flex items-center gap-1 hover:text-primary-dark transition-colors break-all cursor-pointer"
          title={`Ouvrir le lien : ${rawUrl}`}
        >
          <span>{rawUrl}</span>
          <ExternalLink className="w-3.5 h-3.5 inline-block shrink-0" />
        </button>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    elements.push(content.substring(lastIndex));
  }

  return (
    <div className={cn("whitespace-pre-wrap leading-relaxed", className)}>
      {elements}
    </div>
  );
}

export function DataBox({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="space-y-2">
      <div className="text-[9px] font-black uppercase tracking-widest text-accent/30">{label}</div>
      <div className="text-xl font-bold text-secondary tracking-tighter">{value || '-'}</div>
    </div>
  );
}

export function Section({ 
  title, 
  subtitle,
  children, 
  action 
}: { 
  title: string; 
  subtitle?: React.ReactNode;
  children: React.ReactNode; 
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white p-12 rounded-xl border border-accent/10 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-2xl" />
      <div className="relative mb-8 border-b border-accent/10 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-secondary">{title}</h2>
            {subtitle && (
              <p className="text-xs sm:text-sm text-accent/60 font-medium mt-1.5 leading-relaxed max-w-3xl">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

export function TabButton({
  active,
  onClick,
  label,
  count,
  required,
  badge
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  required?: boolean;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-6 py-4 rounded-xl text-xs font-bold transition-all flex items-center justify-between group uppercase tracking-widest",
        active ? "bg-primary text-white shadow-xl shadow-primary/20 scale-105" : "hover:bg-accent/5 text-accent/60"
      )}
    >
      <span className="flex items-center gap-1.5 flex-wrap">
        <span>{label}</span>
        {badge && (
          <span className={cn(
            "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider",
            active ? "bg-white text-primary" : "bg-primary/10 text-primary"
          )}>
            {badge}
          </span>
        )}
        {required && <span className="text-red-500 font-bold ml-0.5">*</span>}
      </span>
      {count !== undefined && (
        <span className={cn("px-2 py-0.5 rounded-full text-[9px]", active ? "bg-white/20" : "bg-accent/5")}>
          {count}
        </span>
      )}
      <ChevronRight className={cn("w-4 h-4 opacity-40 transition-transform", active && "rotate-90 opacity-100")} />
    </button>
  );
}

export function SatisfactionPicker({
  label,
  value,
  onChange
}: {
  label: string;
  value: Satisfaction['tasks'];
  onChange: (v: Satisfaction['tasks']) => void;
}) {
  const options = [
    { v: 'TR' as const, e: '😡' },
    { v: 'M' as const, e: '😐' },
    { v: 'C' as const, e: '😊' },
    { v: 'S' as const, e: '😁' }
  ];
  return (
    <div className="space-y-4">
      <label className="block text-[10px] font-black text-accent/30 uppercase tracking-widest">{label}</label>
      <div className="flex gap-4">
        {options.map(o => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-all border-2",
              value === o.v ? "bg-white border-primary shadow-lg scale-110" : "bg-white border-accent/5 grayscale"
            )}
          >
            {o.e}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Helpers de conversion entre le texte Markdown/stockage et le HTML affiché dans le WYSIWYG
 */
export function markdownToWysiwygHtml(text: string): string {
  if (!text) return '';
  // Échapper les caractères HTML de base pour éviter toute injection
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Remplacer les [texte](url) par un lien HTML interactif cliquable
  html = html.replace(
    /\[([^\]]+)\]\s*\(((?:https?:\/\/|\/)[^\s)]+)\)/gi,
    (_match, linkText, linkUrl) => {
      const cleanUrl = linkUrl.trim();
      const cleanText = linkText.trim();
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="wysiwyg-link text-primary font-bold underline inline-flex items-center gap-0.5 hover:text-primary-dark cursor-pointer">${cleanText}</a>`;
    }
  );

  // Remplacer les sauts de ligne \n par <br>
  html = html.replace(/\n/g, '<br>');
  return html;
}

export function wysiwygHtmlToMarkdown(html: string): string {
  if (!html) return '';
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Remplacer les balises <a> par [texte](url)
  const links = temp.querySelectorAll('a');
  links.forEach(a => {
    const text = a.textContent?.trim() || a.getAttribute('href') || '';
    const href = a.getAttribute('href') || '';
    if (href) {
      a.replaceWith(document.createTextNode(`[${text}](${href})`));
    } else {
      a.replaceWith(document.createTextNode(text));
    }
  });

  // Remplacer les <br> par des sauts de ligne
  const brs = temp.querySelectorAll('br');
  brs.forEach(br => br.replaceWith(document.createTextNode('\n')));

  // Remplacer les <div> ou <p> fermés par des retours à la ligne
  const blocks = temp.querySelectorAll('div, p');
  blocks.forEach(block => {
    block.prepend(document.createTextNode('\n'));
  });

  let raw = temp.textContent || '';
  // Nettoyer les sauts de ligne multiples éventuels au début
  raw = raw.replace(/^\n+/, '');
  return raw;
}

export function FormField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  tooltip,
  required,
  maxLength = 2000,
  labelHref
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  tooltip?: string;
  required?: boolean;
  maxLength?: number;
  labelHref?: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');

  const editorRef = useRef<HTMLDivElement>(null);
  const expandedEditorRef = useRef<HTMLDivElement>(null);
  const savedSelectionRange = useRef<Range | null>(null);

  // Synchroniser la valeur externe vers le contenu HTML de l'éditeur WYSIWYG
  useEffect(() => {
    const expectedHtml = markdownToWysiwygHtml(value || '');
    if (editorRef.current && editorRef.current.innerHTML !== expectedHtml) {
      // Ne mettre à jour que si le texte interne s'est désynchronisé
      const currentMd = wysiwygHtmlToMarkdown(editorRef.current.innerHTML);
      if (currentMd !== (value || '')) {
        editorRef.current.innerHTML = expectedHtml;
      }
    }
    if (expandedEditorRef.current && expandedEditorRef.current.innerHTML !== expectedHtml) {
      const currentMd = wysiwygHtmlToMarkdown(expandedEditorRef.current.innerHTML);
      if (currentMd !== (value || '')) {
        expandedEditorRef.current.innerHTML = expectedHtml;
      }
    }
  }, [value, isExpanded]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const md = wysiwygHtmlToMarkdown(el.innerHTML);
    onChange(md.slice(0, maxLength));
  };

  // Gestion du clic sur les hyperliens dans le WYSIWYG
  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor) {
      e.preventDefault();
      e.stopPropagation();
      const href = anchor.getAttribute('href');
      if (href) {
        openExternalUrl(href);
      }
    }
  };

  const charCount = (value || '').length;

  const handleOpenLinkModal = (isFromExpanded = false) => {
    if (disabled) return;
    const targetRef = isFromExpanded ? expandedEditorRef : editorRef;
    
    // Sauvegarder la sélection courante
    const sel = window.getSelection();
    let selectedText = '';
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (targetRef.current && targetRef.current.contains(range.commonAncestorContainer)) {
        savedSelectionRange.current = range.cloneRange();
        selectedText = range.toString().trim();
      } else {
        savedSelectionRange.current = null;
      }
    } else {
      savedSelectionRange.current = null;
    }

    setLinkText(selectedText);
    setLinkUrl('');
    setShowLinkModal(true);
  };

  const handleApplyLink = () => {
    const trimmedUrl = linkUrl.trim();
    if (!trimmedUrl) {
      setShowLinkModal(false);
      return;
    }
    const cleanUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
    const textToInsert = linkText.trim() || cleanUrl;

    const targetEditor = isExpanded ? expandedEditorRef.current : editorRef.current;
    if (targetEditor) {
      targetEditor.focus();
      const sel = window.getSelection();
      
      // Restaurer la sélection
      if (savedSelectionRange.current && sel) {
        sel.removeAllRanges();
        sel.addRange(savedSelectionRange.current);
      }

      // Créer le nœud de lien HTML propre
      const linkNode = document.createElement('a');
      linkNode.href = cleanUrl;
      linkNode.target = '_blank';
      linkNode.rel = 'noopener noreferrer';
      linkNode.className = 'wysiwyg-link text-primary font-bold underline inline-flex items-center gap-0.5 hover:text-primary-dark cursor-pointer';
      linkNode.textContent = textToInsert;

      if (sel && sel.rangeCount > 0 && targetEditor.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(linkNode);

        // Déplacer le curseur après le lien
        range.setStartAfter(linkNode);
        range.setEndAfter(linkNode);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // Si aucune sélection dans l'éditeur, ajouter à la fin
        if (targetEditor.innerHTML.trim() && !targetEditor.innerHTML.endsWith(' ')) {
          targetEditor.appendChild(document.createTextNode(' '));
        }
        targetEditor.appendChild(linkNode);
        targetEditor.appendChild(document.createTextNode(' '));
      }

      // Synchroniser la nouvelle valeur en Markdown propre
      const md = wysiwygHtmlToMarkdown(targetEditor.innerHTML);
      onChange(md.slice(0, maxLength));
    }

    setShowLinkModal(false);
    setLinkUrl('');
    setLinkText('');
    savedSelectionRange.current = null;
  };

  return (
    <div className="w-full relative group">
      <div className="flex items-center justify-between mb-3 px-2">
        <div className="flex items-center gap-2">
          {labelHref ? (
            <a
              href={labelHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[10px] font-black text-accent/50 hover:text-primary uppercase tracking-[0.2em] transition-colors group/link hover:underline"
              title="Ouvrir le document associé dans un nouvel onglet"
            >
              <span>{label}</span>
              <ExternalLink className="w-3 h-3 text-primary/70 group-hover/link:text-primary transition-transform group-hover/link:translate-x-0.5 shrink-0" />
              {required && <span className="text-red-500 font-bold ml-1">*</span>}
            </a>
          ) : (
            <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em]">
              {label} {required && <span className="text-red-500 font-bold ml-1">*</span>}
            </label>
          )}
          {tooltip && (
            <div className="relative">
              <button
                type="button"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="text-accent/20 hover:text-primary transition-colors"
              >
                <AlertCircle className="w-3.5 h-3.5" />
              </button>
              <AnimatePresence>
                {showTooltip && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-3 bg-accent text-white text-[10px] rounded-base shadow-xl z-50 pointer-events-none"
                  >
                    {tooltip}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-accent" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Bouton insérer un lien dans le WYSIWYG */}
          <button
            type="button"
            onClick={() => handleOpenLinkModal(false)}
            disabled={disabled}
            className="flex items-center gap-1.5 text-[10px] font-black text-primary uppercase tracking-wider hover:text-primary-dark transition-all px-2.5 py-1 bg-primary/10 hover:bg-primary/20 rounded-md cursor-pointer disabled:opacity-40"
            title="Insérer ou transformer la sélection en lien hypertexte"
          >
            <LinkIcon className="w-3 h-3" />
            <span>+ Lien</span>
          </button>

          <span
            className={cn(
              "text-[9px] font-semibold ml-1",
              charCount > maxLength * 0.9 ? "text-amber-500" : "text-accent/30"
            )}
          >
            {charCount}/{maxLength}
          </span>

          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center gap-1 text-[9px] font-black text-secondary uppercase tracking-widest hover:text-secondary-dark transition-all px-2 py-1 bg-secondary/5 hover:bg-secondary/15 rounded-md cursor-pointer"
            title="Agrandir ce bloc"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Agrandir</span>
          </button>
        </div>
      </div>

      {/* Éditeur WYSIWYG direct (contentEditable) */}
      <div className="relative rounded-xl border border-accent/10 focus-within:border-secondary transition-all bg-accent/5 overflow-hidden">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={handleInput}
          onClick={handleEditorClick}
          data-placeholder={placeholder || 'Saisissez votre texte ici...'}
          className={cn(
            "w-full p-5 min-h-[110px] text-base font-light outline-none leading-relaxed text-accent transition-all",
            "empty:before:content-[attr(data-placeholder)] empty:before:text-accent/25 empty:before:pointer-events-none",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
      </div>

      {/* Boîte de dialogue / Popover d'insertion de lien */}
      <AnimatePresence>
        {showLinkModal && (
          <div
            className="fixed inset-0 bg-accent/40 backdrop-blur-xs flex items-center justify-center p-4 z-[200]"
            onClick={() => setShowLinkModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl border border-accent/10 shadow-2xl p-6 w-full max-w-md space-y-4 font-sans"
            >
              <div className="flex items-center justify-between border-b border-accent/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <LinkIcon className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-accent">Insérer un lien hypertexte</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="p-1 text-accent/40 hover:text-accent rounded-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black text-accent/40 uppercase tracking-wider mb-1">
                    Texte affiché
                  </label>
                  <input
                    type="text"
                    value={linkText}
                    onChange={e => setLinkText(e.target.value)}
                    className="w-full p-3 bg-accent/5 rounded-lg border border-accent/10 focus:border-primary focus:ring-0 text-sm font-medium outline-none"
                    autoFocus={!linkText}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-accent/40 uppercase tracking-wider mb-1">
                    URL du lien (web ou Google Drive)
                  </label>
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={e => setLinkUrl(e.target.value)}
                    className="w-full p-3 bg-accent/5 rounded-lg border border-accent/10 focus:border-primary focus:ring-0 text-sm font-medium outline-none"
                    autoFocus={Boolean(linkText)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyLink();
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-accent/10">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-accent/60 hover:text-accent transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleApplyLink}
                  disabled={!linkUrl.trim()}
                  className="px-4 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-lg transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Appliquer</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mode Agrandir plein écran avec le même éditeur WYSIWYG direct */}
      <AnimatePresence>
        {isExpanded && (
          <div
            className="fixed inset-0 bg-accent/60 backdrop-blur-sm flex items-center justify-center p-6 z-[100]"
            onClick={() => setIsExpanded(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl border border-accent/10 shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden"
            >
              <div className="p-8 border-b border-accent/10 bg-accent/5 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xl font-bold text-accent tracking-tight">{label}</h3>
                  <p className="text-[10px] text-accent/40 uppercase tracking-[0.2em] font-black mt-1">
                    Édition plein écran
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {/* Bouton lien plein écran */}
                  <button
                    type="button"
                    onClick={() => handleOpenLinkModal(true)}
                    disabled={disabled}
                    className="flex items-center gap-1.5 text-xs font-black text-primary uppercase tracking-wider hover:text-primary-dark transition-all px-3 py-1.5 bg-primary/10 hover:bg-primary/20 rounded-lg cursor-pointer disabled:opacity-40"
                    title="Insérer un lien hypertexte sur la sélection"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    <span>+ Insérer un lien</span>
                  </button>

                  <span className="text-xs text-accent/40 font-mono">
                    {charCount}/{maxLength}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    className="p-2 hover:bg-accent/5 rounded-full text-accent/40 hover:text-accent transition-colors cursor-pointer"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 p-8 flex flex-col min-h-0">
                <div
                  ref={expandedEditorRef}
                  contentEditable={!disabled}
                  onInput={handleInput}
                  onClick={handleEditorClick}
                  data-placeholder={placeholder || 'Saisissez votre texte ici...'}
                  className={cn(
                    "w-full h-full flex-1 p-8 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary text-xl font-light outline-none placeholder:text-accent/10 custom-scrollbar leading-relaxed overflow-y-auto text-accent",
                    "empty:before:content-[attr(data-placeholder)] empty:before:text-accent/25 empty:before:pointer-events-none"
                  )}
                />
              </div>

              <div className="p-6 bg-accent/5 border-t border-accent/10 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="px-8 py-4 bg-secondary hover:bg-secondary/90 text-white rounded-base text-[10px] font-black uppercase tracking-widest transition-all shadow-md cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  required,
  min = 0,
  max = 999999,
  step = 1,
  tooltip
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
}) {
  const [localStr, setLocalStr] = useState<string>(value ? String(value) : '');
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalStr(value ? String(value) : '');
    }
  }, [value, isFocused]);

  const effectiveMin = Math.max(0, min);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalStr(raw);
    if (raw === '') {
      return;
    }
    const num = Number(raw);
    if (!isNaN(num)) {
      onChange(Math.max(effectiveMin, Math.min(max, num)));
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (localStr === '' || isNaN(Number(localStr))) {
      setLocalStr(String(effectiveMin));
      onChange(effectiveMin);
      return;
    }
    const num = Number(localStr);
    const clamped = Math.max(effectiveMin, Math.min(max, num));
    setLocalStr(String(clamped));
    onChange(clamped);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4 px-2">
        <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em]">
          {label} {required && <span className="text-red-500 font-bold ml-1">*</span>}
        </label>
        {tooltip && (
          <span className="text-[10px] text-accent/40 font-medium italic">{tooltip}</span>
        )}
      </div>
      <input
        type="number"
        min={effectiveMin}
        max={max}
        step={step}
        value={isFocused ? localStr : (value ? String(value) : '')}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        onChange={handleChange}
        className="w-full p-6 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-xl font-bold tracking-tight transition-all"
      />
    </div>
  );
}
