# Admin vNext: 設計・段階導入計画

2026-11-17。基準 main 15cea1304（#41・#39を含む）。未解決の#42は取り込まない。

## 現状と目標

既存はVTuber単件previewと、カテゴリ内のメモリ上60操作batch。カテゴリ移動・再読み込みで作業を失い、PRごとに共通ledgerを書き換える。認証・CSRF・固定repo・検証・publish journalは既存実装を保持する。

最初に保存と公開を分離する。下書きは未検証・未完成でも保存でき、保存を公開承認として扱わない。確定マスターは変更しない。旧PR/preview/journalの形式は維持する。

## Phaseとレビュー境界

1. **本PR**: ownerごとの暗号化DOワークスペース、revisionによる競合拒否、明示保存/自動保存、共通Operation、再開、Undo/Redo、保存状態。既存フォームとの接続。既存PRフローは維持し、保存ワークスペースからの一括提出はまだ公開しない。
2. Phase 1マージ後の最新mainから独立PR: 異種entity batchの全体検証、依存選択、フィールド単位3-way適用、ID再発行、個別auditファイル、任意理由、自動PR本文、提出履歴/CI状態、確認付きbranch更新。旧ledgerを保持し、旧Workerが新protocolを送信できないguardを追加。
3. Phase 2マージ後の最新mainから独立PR: DADS参照AppShell/DataTable/InlineEditor、セル/複数選択/一括編集/列/ソート/キーボード/変更レビュー。保存と一覧/詳細を同じOperationに統一。
4. Phase 3マージ後の最新mainから独立PR: 全カテゴリ仕上げ、20件横断E2E、実測/画面比較、導入/切戻し資料。全Phaseが揃うまではvNext完成とは扱わない。

後続を依存branchへマージしない。#42の既存ledger競合や失敗を本PRで解決済みとしない。

## 保存モデル

1人に1つのactive Workspace。workspaceProtocol=1、ownerId、workspaceId、revision、createdAt/updatedAt/expiresAt、operations。Operationはkey、entity、既存idまたは一時key、baseCommit、before/value、validationState=unchecked。出演枠はEvent内の既存slotsとして保持。beforeは将来の3-way比較用で、公開根拠として信用しない。

既存SQLite entriesに別prefixで保存、SESSION_KEYでAES-GCM暗号化。所有者はセッションの数値IDから導出し、クライアント指定owner/keyを受け付けない。30日（保存時延長）、最大120変更、JSON最大512KiB、履歴Undo/Redoはブラウザー内30段階。保存専用APIだけ上限を拡張、既存preview100KB/60操作は維持する。セッション失効・logout・Worker再起動でも保存済み下書きは残る。Secret変更時は旧キーでの復号が必要なのでローテーションと同時に実施しない。

CASとDOのconcurrency lockで同時tabの古いrevisionを409拒否。失敗した入力はメモリに保持し、自動リトライ上書きしない。再読込は破棄確認後のみ。OAuth token/Secretsをフォーム状態に含めず、未知メタデータ/危険キーを拒否。保存APIは既存認証・allowlist・repo権限・CSRFを必須とする。GitHubへ下書きを書かない。

## UIと実装方式

Phase 1では既存編集画面を維持し、共通保存バーと変更内容画面を追加する。Phase 3の1440pxは208px sidebar/残り全幅、必要時360px detail panel。1920pxも固定max-widthに閉じ込めない。390pxは折畳navと単一編集領域。

既存native DOM/CSS modulesを継続。React移行は既存フォームの再実装と追加runtime/ビルドを要し、安全性の向上に直結しない。依存・有料サービスは増やさない。DADSの原則からlocal tokensと小さなDOM部品を作る。準拠認定や官公庁運営は表明しない。

## 計測仕様

同じデータ・viewportでBefore/After。1440/1920で表示行数、main幅/viewport、1件/10件の入力以外のクリックと画面遷移数。390/320/768のoverflow、キーボード、focus、light/darkも確認。Phase 1は保存/復旧を評価し、未実装の一覧編集による効率改善は計上しない。

## 互換性・導入

Schema v2・公開data・公開version・Worker名・DO binding/class/instance名・migration tag・Secrets/varsは不変。既存entryに新prefix追加のみ。旧Workerへ戻しても新prefixは無視され、既存session/journalを維持する。新下書きから旧previewを自動生成しない。導入は人間の承認後に既存本番設定と切戻し版を再確認して実施。本PRはdeployしない。
