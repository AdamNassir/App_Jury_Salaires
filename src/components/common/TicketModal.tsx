import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Mail, CheckCircle2, Copy, AlertCircle, MessageSquarePlus, ExternalLink } from 'lucide-react';
import { UserProfile } from '../../types';

interface TicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserProfile | null;
  currentView?: string | null;
}

const TARGET_EMAIL = 'adam.nassir@logiclever.com';

export function TicketModal({ isOpen, onClose, currentUser, currentView }: TicketModalProps) {
  const [problemType, setProblemType] = useState('');
  const [details, setDetails] = useState('');
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setProblemType('');
    setDetails('');
    setCopied(false);
    setStatusMessage(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const buildEmailBody = () => {
    const lines = [
      `Détails de la demande :`,
      `----------------------------------------`,
      details.trim(),
      ``,
      `----------------------------------------`,
      `Informations contextuelles du collaborateur :`,
      `- Nom : ${currentUser?.displayName || 'Non renseigné'}`,
      `- Email : ${currentUser?.email || 'Non renseigné'}`,
      `- Matricule / Id_Profil : ${currentUser?.matricule || currentUser?.idProfil || 'Non renseigné'}`,
      `- Rôle(s) : ${currentUser?.roles?.join(', ') || 'Utilisateur'}`,
      `- Vue active : ${currentView || 'Accueil'}`,
      `- Date et heure : ${new Date().toLocaleString('fr-FR')}`
    ];
    return lines.join('\n');
  };

  const handleSendEmail = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!problemType.trim() || !details.trim()) {
      setStatusMessage('Veuillez renseigner le type de problème et les détails avant d\'envoyer.');
      return;
    }

    const subject = `[Ticket Jury Salaires] ${problemType.trim()}`;
    const body = buildEmailBody();
    const mailtoUrl = `mailto:${TARGET_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    // Ouvrir le client de messagerie
    window.location.href = mailtoUrl;

    setStatusMessage('Votre logiciel de messagerie a été ouvert avec le ticket pré-rempli pour adam.nassir@logiclever.com.');
  };

  const handleCopy = async () => {
    if (!problemType.trim() || !details.trim()) {
      setStatusMessage('Veuillez renseigner le type de problème et les détails avant de copier.');
      return;
    }
    const subject = `[Ticket Jury Salaires] ${problemType.trim()}`;
    const fullText = `Destinataire : ${TARGET_EMAIL}\nObjet : ${subject}\n\n${buildEmailBody()}`;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
    }
  };

  const handleOpenWebmail = () => {
    if (!problemType.trim() || !details.trim()) {
      setStatusMessage('Veuillez renseigner le type de problème et les détails.');
      return;
    }
    const subject = `[Ticket Jury Salaires] ${problemType.trim()}`;
    const body = buildEmailBody();
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(TARGET_EMAIL)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-secondary/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl shadow-2xl border border-accent/15 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* En-tête */}
          <div className="p-6 bg-gradient-to-r from-secondary to-secondary/95 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary-light">
                <MessageSquarePlus className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Envoyer un ticket / Demande d'évolution</h3>
                <p className="text-xs text-slate-300">
                  Transmis directement à <strong className="text-emerald-400">{TARGET_EMAIL}</strong>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Corps du formulaire */}
          <form onSubmit={handleSendEmail} className="p-6 overflow-y-auto space-y-5 flex-1">
            {statusMessage && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">{statusMessage}</p>
                </div>
              </div>
            )}

            {/* Champ 1 : Type de problème (Sujet de l'email) - SANS PLACEHOLDER */}
            <div className="space-y-1.5">
              <label htmlFor="ticket-problem-type" className="block text-xs font-black uppercase tracking-wider text-secondary">
                Type de problème ou demande <span className="text-primary">*</span>
              </label>
              <span className="block text-[11px] text-accent/60">
                Cet élément constituera l'objet de l'email adressé à {TARGET_EMAIL}.
              </span>
              <input
                id="ticket-problem-type"
                type="text"
                required
                value={problemType}
                onChange={(e) => setProblemType(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-white border border-accent/20 rounded-xl text-secondary font-medium focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition-all"
              />
            </div>

            {/* Champ 2 : Détails du problème - SANS PLACEHOLDER */}
            <div className="space-y-1.5">
              <label htmlFor="ticket-details" className="block text-xs font-black uppercase tracking-wider text-secondary">
                Détails de votre demande ou issue <span className="text-primary">*</span>
              </label>
              <span className="block text-[11px] text-accent/60">
                Précisez le comportement observé, la modification souhaitée ou les étapes pour reproduire.
              </span>
              <textarea
                id="ticket-details"
                required
                rows={6}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="w-full px-4 py-3 text-sm bg-white border border-accent/20 rounded-xl text-secondary font-normal focus:ring-2 focus:ring-primary focus:border-primary focus:outline-none transition-all resize-y leading-relaxed"
              />
            </div>

            {/* Informations de contexte automatiques */}
            <div className="bg-accent/5 p-4 rounded-xl border border-accent/10 text-xs space-y-1.5 text-accent/70">
              <div className="text-[10px] font-black uppercase tracking-wider text-secondary">
                Informations jointes automatiquement au ticket :
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                <div><strong>Expéditeur :</strong> {currentUser?.displayName || 'Inconnu'} ({currentUser?.email || 'N/A'})</div>
                <div><strong>Matricule :</strong> {currentUser?.matricule || currentUser?.idProfil || 'N/A'}</div>
                <div><strong>Page actuelle :</strong> {currentView || 'Accueil'}</div>
                <div><strong>Destinataire :</strong> {TARGET_EMAIL}</div>
              </div>
            </div>

            {/* Boutons d'action */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-accent/10">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!problemType.trim() || !details.trim()}
                  className="px-3.5 py-2 text-xs font-bold text-accent bg-accent/5 hover:bg-accent/10 disabled:opacity-40 disabled:cursor-not-allowed border border-accent/15 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Copier le texte dans le presse-papier"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copied ? 'Copié !' : 'Copier'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenWebmail}
                  disabled={!problemType.trim() || !details.trim()}
                  className="px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed border border-indigo-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Ouvrir dans Gmail Web"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Gmail Web</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-xs font-bold text-accent/70 hover:text-secondary rounded-xl hover:bg-accent/5 transition-all cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!problemType.trim() || !details.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-primary hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Envoyer le ticket</span>
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
