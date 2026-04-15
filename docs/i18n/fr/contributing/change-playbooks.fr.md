# Guides de modification

Guides pas à pas pour les extensions et modifications courantes dans ZeroClaw.

Pour des exemples de code complets sur chaque trait d’extension, voir [extension-examples.md](../../../contributing/extension-examples.md).

## Ajouter un fournisseur

- Implémenter `Provider` dans `src/providers/`.
- L’enregistrer dans la fabrique de `src/providers/mod.rs`.
- Ajouter des tests ciblés sur le câblage et les chemins d’erreur.
- Éviter que le comportement spécifique au fournisseur fuite dans l’orchestration partagée.

## Ajouter un canal

- Implémenter `Channel` dans `src/channels/`.
- Garder `send`, `listen`, `health_check` et la sémantique de frappe cohérents.
- Couvrir auth, liste d’autorisation et santé avec des tests.

## Ajouter un outil

- Implémenter `Tool` dans `src/tools/` avec un schéma de paramètres strict.
- Valider et assainir toutes les entrées.
- Retourner un `ToolResult` structuré ; éviter les panic sur le chemin d’exécution.

## Ajouter un périphérique

- Implémenter `Peripheral` dans `src/peripherals/`.
- Les périphériques exposent `tools()` — chaque outil délègue au matériel (GPIO, capteurs, etc.).
- Enregistrer le type de carte dans le schéma de configuration si nécessaire.
- Voir `docs/hardware/hardware-peripherals-design.md` pour le protocole et le firmware.

## Changements sécurité / runtime / passerelle

- Inclure menaces/risques et stratégie de retour arrière.
- Ajouter ou mettre à jour des tests ou preuves de validation pour les modes de défaillance et les limites.
- Garder l’observabilité utile mais non sensible.
- Pour `.github/workflows/**`, documenter l’impact sur la liste d’autorisation Actions dans la PR et mettre à jour `docs/contributing/actions-source-policy.md` si les sources changent.

## Système de documentation / README / IA

- Traiter la navigation comme une UX produit : README → hub docs → SUMMARY → index par catégorie.
- Garder la navigation de premier niveau concise ; éviter les liens dupliqués entre blocs adjacents.
- Quand les surfaces runtime changent, mettre à jour les références dans `docs/reference/`.
- Lors des changements de navigation ou de libellés clés, garder la parité des points d’entrée multilingues pour toutes les locales (`en`, `zh-CN`, `ja`, `ru`, `fr`, `vi`).
- Lors des changements de texte partagé, synchroniser les docs localisées dans la même PR (ou documenter explicitement le report et une PR de suivi).

## État partagé des outils

- Suivre le motif de handle `Arc<RwLock<T>>` pour tout outil possédant un état partagé longue durée.
- Accepter les handles à la construction ; ne pas créer d’état global/statique mutable.
- Utiliser `ClientId` (fourni par le démon) pour isoler l’état par client — ne jamais construire des clés d’identité dans l’outil.
- Isoler l’état sensible (identifiants, quotas) par client ; l’état de diffusion peut être partagé avec préfixe d’espace de noms optionnel.
- La validation mise en cache est invalidée lors d’un changement de configuration — les outils doivent re-valider avant la prochaine exécution après signal.
- Contrat complet : [ADR-004: Tool Shared State Ownership](../../../architecture/adr-004-tool-shared-state-ownership.md).

## Boucle d’outils de l’agent, QueryEngine et hooks

- **Chemin d’outils unique :** `run_tool_call_loop` dans `src/agent/loop_.rs` passe toujours par `run_query_loop` dans `src/agent/query_engine.rs`, qui enregistre les diagnostics [`TransitionReason`](../../../../src/agent/state.rs) et exécute les hooks post-tour en succès **`void` + `blocking`** (`src/agent/stop_hooks.rs`). Il n’y a **pas** de feature Cargo `query_engine_v2` ; ce chemin est toujours actif.
- **Compaction :** le rognage avant appel LLM utilise `src/agent/compaction_pipeline.rs` (étapes nommées + `history_pruner`) ; les tentatives de contexte réactif utilisent les mêmes helpers lorsqu’elles sont câblées depuis la boucle.
- **Prompt système :** l’assemblage canonique est dans `src/agent/system_prompt.rs` (préfixe statique mémoïsé + queue volatile ; `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` pour le découpage). `build_system_prompt_*` dans `src/channels/mod.rs` délègue ici ; certains chemins passent `system_prompt_refresh` à `run_tool_call_loop` pour que `src/agent/loop_.rs` rafraîchisse `history[0]` après `run_pre_llm_phases`. `src/providers/anthropic.rs` mappe ce marqueur vers deux blocs system pour le cache de prompt. Statistiques en processus : `crate::agent::query_engine::last_system_prompt_assembly` et `zeroclaw doctor query-engine`.
- **Transcript d’abord :** les lignes utilisateur pour le JSONL de session doivent être validées via `session_transcript::commit_user_turn` à la frontière d’orchestration avant le travail du modèle (canaux et `Agent::turn` / `turn_streamed` suivent ce motif).
- **Construction du HookRunner :** `crate::hooks::hook_runner_from_config` (`src/hooks/mod.rs`) enregistre les builtins configurés lorsque `[hooks].enabled`, et enregistre **`MemoryConsolidationHook`** dès que `memory.auto_save` est vrai (même si les hooks sont désactivés), pour éviter de dupliquer `tokio::spawn` dans les canaux.
- **Passerelle :** construire `HookRunner` dans `run_gateway`, le stocker dans `AppState.hooks`, passer `state.hooks.clone()` à `Agent::from_config_with_hooks` pour `/ws/chat` afin d’aligner les hooks post-tour sur le comportement des canaux.
- **Sink de tour en flux :** `run_tool_call_loop` / `run_query_loop` acceptent un `turn_event_sink` optionnel (`Sender<TurnEventSink>`) : [`TurnEventSink::DeltaText`](../../../../src/agent/agent.rs) porte les brouillons / chaînes de progression depuis la boucle d’outils ; [`TurnEventSink::Emit`](../../../../src/agent/agent.rs) enveloppe [`TurnEvent`](../../../../src/agent/agent.rs) pour les morceaux du modèle et la télémétrie des outils. [`Agent::turn_streamed`](../../../../src/agent/agent.rs) utilise le même type ; [`src/gateway/ws.rs`](../../../../src/gateway/ws.rs) mappe vers le JSON WebSocket (`chunk`, `tool_call`, `tool_result`, puis `chunk_reset` + `done`). Protocole utilisateur : [`.claude/skills/zeroclaw/references/rest-api.md`](../../../../.claude/skills/zeroclaw/references/rest-api.md).
- **Étendre le comportement post-tour :** implémenter `HookHandler::on_after_turn_completed` / `after_turn_completed_blocking` (ils reçoivent `user_message` + `assistant_summary`) ; enregistrer sur le même `HookRunner` que la passerelle ou les canaux.

## Règles de frontière d’architecture

- Étendre en priorité par nouvelles implémentations de traits + câblage en fabrique ; éviter les réécritures transversales pour une fonction isolée.
- Garder les dépendances orientées vers l’intérieur : les intégrations concrètes dépendent des couches traits/config/utilitaires, pas d’autres intégrations concrètes.
- Éviter le couplage entre sous-systèmes (ex. code fournisseur important des internes de canal, outil modifiant directement la politique passerelle).
- Responsabilité unique par module : orchestration dans `agent/`, transport dans `channels/`, E/S modèle dans `providers/`, politique dans `security/`, exécution dans `tools/`.
- N’introduire de nouvelles abstractions partagées qu’après usage répété (règle des trois), avec au moins un appelant réel.
- Pour les changements de config/schéma, traiter les clés comme contrat public : documenter les défauts, l’impact de compatibilité et le chemin de migration/rollback.
