# Security Specification - Jury des Salaires LL

## Data Invariants
1. A candidate can only create/edit their own dossier.
2. A dossier's candidateId cannot be changed after creation.
3. A consultant can only edit the `consultantOpinion` section of a dossier that is in 'OUVERT' or 'COMPLET' status (but not 'VALIDE').
4. The jury can only update the `juryDecision` and `status` fields of a dossier that is 'COMPLET'.
5. Once a dossier is 'VALIDE', it is locked and cannot be edited by anyone (except admins if defined).
6. A user's role can only be assigned by a system administrator (or initial setup).
7. Documents must have a valid URL.
8. Status transitions: OUVERT -> COMPLET -> VALIDE.

## The "Dirty Dozen" Payloads (Denial Expected)

1. **Identity Spoofing**: Candidate A tries to create a dossier for Candidate B.
2. **Role Escalation**: Candidate tries to update their own role doc to 'JURY'.
3. **Privilege Overreach**: Candidate tries to modify `consultantOpinion` or `juryDecision`.
4. **Premature Verdict**: Jury tries to validate a dossier that is still 'OUVERT'.
5. **Locked State Breach**: Candidate tries to edit a 'VALIDE' dossier.
6. **Malicious Consultant**: User who is not a 'CONSULTANT' tries to fill the consultant section.
7. **Phantom Document**: Creating a dossier with 1000+ empty documents (Denial of Wallet).
8. **ID Poisoning**: Creating a dossier with a 2KB junk string as ID.
9. **Timestamp Spoofing**: Setting `updatedAt` to a future date instead of `request.time`.
10. **State Shortcutting**: Skipping 'COMPLET' and going straight to 'VALIDE' from 'OUVERT'.
11. **Negative Salary**: Jury trying to set a negative augmentation amount.
12. **Secret Data Retrieval**: Candidate B trying to `get` the consultant opinion of Candidate A (if we decide consultants opinions are private until a certain point, but here let's say they are part of the dossier). Actually, let's say a Candidate cannot read other Candidates' dossiers.

## Role-Based Access Control (RBAC)
- **CANDIDATE**: 
    - Read: Own dossier.
    - Create: Own dossier if none exists for the year.
    - Update: Own dossier (restricted fields: `annualReport`, `documents`, `status` to COMPLET).
- **CONSULTANT**:
    - Read: All dossiers (to help them navigate).
    - Update: `consultantOpinion` on any dossier.
- **JURY**:
    - Read: All dossiers.
    - Update: `juryDecision`, `status` to VALIDE.

Wait, for MVP simplicity, maybe candidates *can't* see the consultant's target TJM? The prompt doesn't specify. I'll assume they can see the whole dossier since it's "transparent" for the jury, but usually, consultant opinions might be hidden from candidates. I'll follow the prompt which says "Candidate: ... follows the state of completeness". It doesn't say they can see the consultant's notes.
However, "Consultant: internal peer who completes the candidate's file...". 
I'll stick to: Candidates can see their OWN dossier. Consultants/Jury can see ALL dossiers.

Wait, the prompt says "Consultant: internal peer who completes the candidate's file with his opinion...". This implies they work on the SAME document.
I will implement permissions where:
- Candidate can read/write their own report fields.
- Consultant can read dossiers and write opinion fields.
- Jury can read dossiers and write jury fields.

## Test Runner (firestore.rules.test.ts)
(I will implement this later if needed, for now I'll focus on the rules).
