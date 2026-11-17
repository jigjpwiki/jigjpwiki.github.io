# Admin vNext Phase 3

Phase 1 (#43) / Phase 2 (#44) マージ済みのmain 57cefb121から独立。公開master・Schema・公開サイト2.13.0・収集処理・OAuth・Secrets・DO・提出APIを変更せず、編集UIを更新する。

## 使い方

- 左のカテゴリで一覧を開く。事務所/グループ、音楽の5種類、グッズのCampaign/Product/Offerはカテゴリ内で切替。
- 検索、複合条件、見出しソート、列表示・幅調整を併用。1ページ50行。検索結果全体とこのページの選択は別操作。条件外に選択が残れば件数を表示。
- セルはクリック/Enterで編集、Enterまたはblurで確定、Escで取消。編集外の矢印で移動。入力内のTab/Shift+Tabは確定して次/前のセルへ。IME中のEnterは奪わない。不正入力はそのセルで保持し、確定/取消まで画面移動や表の再描画を止める。
- 行を選択し一括変更する項目・値を選ぶ。対象名、件数、値を確認して下書きに適用。同じ型の列だけが候補。PRは作らない。
- 黄色＋印のセルはmainと異なる下書き。「変更前後」から値を比較。上部の保存済みはDO成功を意味し、公開反映ではない。元に戻す/やり直すは共通Workspace全体（最大30履歴）。入力欄のCtrl/Cmd+Zはnative Undo、表外ではWorkspace Undo。
- 詳細で所属履歴、アカウント、日時精度、出演枠、関連楽曲等を編集。PCは一覧併置、狭い画面は切替。閉じる/Escで下書きを維持し一覧へ戻る。全画面編集にも切替可能。
- キャンペーン詳細で商品とOfferを各テーブルで編集。複数Offerは別行のまま。既存商品の再利用はその固定IDへの新Offer、新規複製は別のtempキー・非公開・公式URL空欄の未完成下書き。IDや同一性URLをコピーして重複公開しない。新商品には販売情報を追加し、通常検証/プレビューを経て提出する。
- 「変更内容」でカテゴリ混在の対象を選び、Phase 2のプレビュー・確認後に提出。部分提出では残りを保持。main/別タブ競合は上書きせず表示。

## 構成

| 部品 | 実装 |
| --- | --- |
| AppShell / Sidebar / PageHeader | index.html、workbench.css、app.js。224px sidebar、残り幅を利用。main幅は1440で1216px、1920で1696px（padding含む） |
| DataTable / Toolbar / InlineEditor | data-table.js。検索/ソート/列/範囲/確認/ページング/roving cell focus |
| 型別の列・日付 | table-columns.js。Schemaのenumを利用、年なし日付、金額・URL、活動/所属状態の独立 |
| DetailPanel | detail-panel.js。同じフォームとWorkspace、Esc/復帰focus、全画面切替 |
| SearchCombobox / DateTimeField | 既存controls.js namePicker、content-fields.jsを再利用。検索＋native select、固定IDを維持、JST⇔保存形式を変更しない |
| ValidationMessage / SaveIndicator / StatusIndicator | 入力近くのalert、既存エラー概要、共有保存bar、status live領域。確認前に勝手に送信しない |
| ConfirmationDialog / ChangeReview | native dialog＋focus循環。Phase 2 submissions.jsをそのまま同じshellで使用。CI/再適用/監査ロジックの再実装なし |

[設計](DESIGN.md) / [DADSの確認先](dads-research.json)。2026-11-17時点のDADS β2.18.2の基本・色・文字・余白・各操作部品・アクセシビリティを再確認。HTML/ReactスニペットはMIT。コードやFigma素材は複製せず、独自DOM/CSSを採用。Reactやランタイム依存は追加しない。Fontや外部UI CDNも利用しない。

## 同条件の実測

`tests/phase3.browser.mjs`で1440×1000px・同じmainデータ・同じmock Workerを使用。Beforeはマージ済みPhase 2の実際のpublicファイル。文字入力・select値入力・スクロールを除くクリックをDOM listenerで計数。チェックボックス/確定/保存/PR確認は含む。Enterで確定するキー操作はクリックに換算していない。初回カテゴリ表示後から測定。時間の短縮率や実際の人間の熟練度を推定するベンチマークではない。

| 作業 | 保存まで Before→After | 模擬PRまで Before→After | 編集時の画面再構成 Before→After |
| --- | --- | --- | --- |
| A 記念日10件の名称 | 21→11 | 25→15 | 20→0 |
| B VTuber10人の活動状態 | 41→13 | 45→17 | 30→1 |
| C イベント5件の名称 | 11→6 | 15→10 | 10→0 |
| D 既存Campaign1＋Product5＋Offer5 | 23→13 | 27→17 | 22→2 |
| E A/B混在20件→1PR | — | 67→29 | 54→4（PR操作を含む） |

Bの対象者・変更先状態は現在マスターから異なる値になるよう選び、人物の状態を固定期待値にしない。

Aは10回のセル編集/Enterであり、10回フォームを開いて戻る必要はない。Bは10個のcheckbox＋適用＋確認＋保存。DはCampaignと10関連レコードのID/URLを保ち名称と価格だけを変更。Eは20種類のentityという意味ではなく、2カテゴリ20レコードを同じPRに提出する検証。新規複合登録は既存全カテゴリE2Eで別途検証する。

`transitions`はhashによるカテゴリ移動、`screenChanges`は#view直下を置換/追加する画面再構成（MutationObserverで計測）。セルDOMの再描画は画面遷移に数えない。対象の切替数はA/B9、C4、D10、E19で、同じデータを編集するため省略していない。密度は測定時の完全に表示できる行数をJSONへ記録。長い名称、画像、列幅、viewportで変わる。1920pxも固定1120pxに戻さず利用する。

[Before実測](screens/before-metrics.json) / [After実測](screens/after-metrics.json)。PR提出後の画面は一覧ではないのでvisibleRows=0。比較する一覧密度はA〜Dの保存時の値を利用。

## Before / After

| 画面 | Before | After |
| --- | --- | --- |
| 記念日 PC | [1440](screens/before-A-1440.png) / [1920](screens/before-anniversaries-1920.png) | [1440](screens/after-anniversaries-1440.png) / [1920](screens/after-anniversaries-1920.png) |
| 記念日 モバイル | [390](screens/before-anniversaries-390.png) | [390](screens/after-anniversaries-390.png) |
| VTuber | [1440](screens/before-B-1440.png) | [1440](screens/after-talents-1440.png) |
| 詳細 | [390](screens/before-detail-390.png) | [390](screens/after-detail-390.png) / [1440](screens/after-detail-1440.png) |
| Campaign/商品/Offer | [1440](screens/before-campaign-detail-1440.png) | [1440](screens/after-campaign-detail-1440.png) |
| 保存競合 | 既存のWorkspace処理 | [入力保持](screens/after-save-conflict-1440.png) |
| PR | [1440](screens/before-E-1440.png) | [1440](screens/after-E-1440.png) |

320/390/768/1440/1920、light/dark、キーボード。撮影後に行の過剰な高さ、sidebarのauto margin、狭い画面で保存barを覆うpanel、未選択時の冗長な一括入力欄を修正し再撮影。色だけで変更を示さず印/差分を付ける。table以外のdocument overflowがないことを検証。ダイアログのfocus循環、Escape、ラベル、エラーのlive通知と読み上げ用説明、フォーカスの復帰を確認。WCAG 2.2 AAへの完全適合や実スクリーンリーダーの全組合せを認証したとは主張しない。

## 検証

- root: check / 195単体テスト / build / 全7 browser suites。
- Admin: 71単体テスト / build・check（dry-run） / 実workerd・SQLite / 既存全browser suites＋Phase 3。
- 追加: 検索・複合条件・日本語ソート・列・50行制限、セル/一括/Undo/Redo/再読込、panel・別カテゴリ、年なし/閏日/不正日付、保存503/再試行・CAS競合、対象外データ保持、商品再利用・複製、20件一括/5件部分提出と15件保持、確認modalのTab循環、各幅。
- 歌枠/出演枠/複合商品新規、OAuth/CSRF/権限/ID/参照/非公開/3-way/CI判定は既存テストを維持。GitHubの書込はすべてmock、DB/公開データへテスト値は追加しない。

実CIリンクはPR本文に記載。公開Artifactのallowlist、公開データ、収集/API消費に差分なし。Admin UIは約55.7KB（gzip約16.0KB）増加。公開サイトbuildは約1.85秒で、公開用アセットの追加なし。UIの静的ファイル追加だけでWorkerコード・Schema・プロトコルは同じ。公開サイトのrelease変更は不要。

## 導入と切戻し

1. 所有者がPR差分・CI・画面をレビューしてmainへマージする（本作業では実施しない）。
2. 必要時に既存の本番設定を読み取り、直前のWorker Version IDを記録。既存の保存/Secrets/varsを保持するデプロイ手順を使用し、テンプレートのADMIN_ENABLED=false等を適用しない。
3. 最新mainのAdmin build/dry-run後、所有者の別途承認を得て、jigwiki-adminのcode＋public assetsのみを一緒にデプロイする。DO class/binding/namespace、SESSION_KEY、migrationタグは変更しない。
4. 保存→復元→部分PR確認をテストし、問題時は記録した旧Versionへ切り戻す。workspace protocol 1 / submission protocol 2の互換性を維持するためデータ変換は不要。キャッシュせず再読込する。

本PRでデプロイ、Secrets変更、#42の変更、main push、マージは実施しない。

## Phase 4へ

- 全master fixtureの総整理、実運用の大規模データ/支援技術による総合検証。
- 列の設定はページ内のみ。列を持つ各一覧の任意な組み替えや永続ユーザー設定、dragでの列幅変更は今後検討。今はキーボード操作可能なrangeで列幅を設定する。
- 仮想スクロールは導入せず50行pagination。フィルター/ソートは読み込んだデータ全体に対して行う。
- 配列の同時変更はPhase 2通り原子的な競合。120操作/512KiB workspace、30段階Undo、GitHub45呼出等の既存上限を維持。
- 未完成複製のID/URLは推測しない。完成・検証前の公開/PR提出は拒否される。別の楽曲の同名統合、在庫や活動状態の自動推測はない。
