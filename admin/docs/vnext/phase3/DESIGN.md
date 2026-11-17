# Phase 3 編集UI設計

最新main 57cefb121（#43/#44マージ済み）から独立。認証、DO、workspace protocol 1、submission protocol 2、全master検証は変更しない。

## 接続点

- AppShell: 224px sidebar、残り全幅、上部の保存状態とPR導線。DADS β2.18.2（2026-11-17再確認）の色・文字・8px余白・focus/labelを参照。MITの公式HTML/React例は参考のみ、コード/素材の複製なし。既存DOMを維持しruntime依存を増やさない。
- DataTable: native table、50行pagination、検索/複合filter/ソート/列表示/列幅/明示checkbox選択。編集可能セルはEnterまたはボタン、Escape取消。矢印は編集外のみセル移動。編集中はnative input、IMEを妨げない。データ全体はメモリ内だがDOMはページ単位。
- InlineEditor: 型と許容enumを列定義で限定。nullは空欄、年月日に年を補完しない。変更は既存Workspaceのbefore/baseCommitを保持してupsert。bulkは選択対象/件数/値をdialogで確認し1回のWorkspace.replace（Undo1回で復元）。操作だけでPRは作らない。
- DetailPanel: 同じフォームを使用。PCは一覧併置、狭い画面は一覧と切替える非modalパネル（確認のみnative dialog）。閉じる/Escは下書き保持、フォーカスを元へ戻す。全画面切替可能。複雑な配列/関連追加は既存フォームを再利用。
- 商品: Campaign→Product→Offer。歌枠→Performance。既存参照pickerで再利用、新規はtemp参照を維持、複製はIDをコピーしない。
- Undo/Redo/保存は共有Workspace。保存済み=DO成功、公開反映ではない。入力中にカテゴリを移動してもWorkspaceから復元。提出/競合解決/CIはPhase 2 UIを同じshellへ統合。

## 安全性

UIの列定義はサーバー検証の代替ではない。未完成下書き保存と公開可能性を区別。活動状態/所属状態/visibilityは独立、日時から推定しない。フィルター全件選択は範囲明示、異なるentityには一括値適用しない。IDは編集不可。保存失敗/CAS時は入力保持し成功表示しない。
