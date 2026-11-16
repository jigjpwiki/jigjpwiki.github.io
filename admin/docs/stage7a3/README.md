# Stage 7A3: 管理画面の情報編集と差分レビュー

最新main `06ac6882b` を起点とするAdmin専用の改修。`MASTERS.md`のSchema・固定ID・全master検証と、`SETUP.md`のOAuth/Session/CSRF/権限/PR提出の構成を維持する。新しいサービス・依存パッケージ・Secrets・手動設定は不要。反映には所有者による通常のAdminデプロイが必要で、本PRではデプロイしない。

## 画面とデータフロー

- VTuber編集を基本情報／所属・活動／SNS・リンク／出典・履歴／確認・プレビューに分離。PCは最大幅1120px・2列、モバイルは1列。タブは矢印/Home/Endで操作可能。
- 名前・画像・所属・公式リンクをヘッダーに表示。固定IDは読み取り専用。所属状態とVTuber活動状態を別々に保持し、卒業から引退を推測しない。
- 所属・メンバーは名前で検索し、選択した固定IDを保持。配列はカードごとの明示的な追加・削除。事務所・グループ編集にも同じフォーム部品を使用。
- 出典の概要は登録件数・公式／非公式の区別を表示し、展開してURL・種類・確認日で検索・選択できる。新規出典は項目内で明示登録する。既存出典の確認日や内容を自動更新しない。新規出典の確認日時は登録操作時刻。
- `draft.js`は取得masterから切り離した編集値と、nullable項目の復元値を保持。空欄はnullにするが、再入力時は既存の出典を復元。明示的に外した出典を補完したことにはしない。
- 未保存の変更を表示し、一覧・ナビゲーション・ログアウト・戻る操作・ページ離脱時に確認する。編集中のデータはメモリー内のみで、ブラウザーを閉じた後の復元は提供しない。
- フィールドエラーと概要からの移動を提供。別レコードの検証失敗はその人物名を表示し、変更破棄の確認を経て対象へ移動する。サーバーの全master検証は必ず実行する。
- プレビューはサーバーが確定した差分を項目別に表示。画像は新旧比較、追加・変更・削除を明示。参照影響とJSON全文は展開表示。理由・公式出典・確認日時を確認し、チェックした後だけPR提出できる。検証中はフォーム操作を止め、二重提出とAPIエラー後の再試行は既存PRゲートウェイで処理する。

## Wiki出典が空に見える条件の確認

mainの `tal-000004.wiki.sourceRefs` は `src-wiki-lee-jupita` を保持している。旧再帰フォームではnullable項目を「未登録」に切り替え、戻した際に `empty(schema)` で空オブジェクトを再作成するため、その項目のURL/sourceRefsが初期化される経路を確認した。**画像URLの通常入力だけで別レコードが変更される現象は再現しておらず、過去の実環境操作の根本原因をこの経路と断定しない。**

新フォームではWiki/画像のURLを消去・再入力しても元の有効な出典を保持する。ブラウザーで李じゅぴ汰の画像のみ変更→所属/SNSの追加・削除→タブ往復→プレビュー送信を検証し、Wikiを含むそれ以外のフィールドが完全一致することを確認。単体テストでは全master検証後の残り96名の不変も比較する。出典を明示的に空にすると引き続き検証に失敗する。

## 画面比較

OAuth・GitHub APIはfixture。画像取得を遮断し、失敗時フォールバックと編集継続を確認した。実データの氏名・出典を使い、外部サイトへの書き込みはない。画像はこのdocs内のみで、Pages/Worker公開アセットに含めない。

| 画面幅 | 改修前（全項目） | 改修後（基本情報） | ダーク | 差分プレビュー |
| --- | --- | --- | --- | --- |
| 320 | [前](screens/before/editor-320.png) | [後](screens/after/admin-editor-320.png) | [暗](screens/after/admin-editor-dark-320.png) | [比較](screens/after/admin-preview-320.png) |
| 390 | [前](screens/before/editor-390.png) | [後](screens/after/admin-editor-390.png) | [暗](screens/after/admin-editor-dark-390.png) | [比較](screens/after/admin-preview-390.png) |
| 768 | [前](screens/before/editor-768.png) | [後](screens/after/admin-editor-768.png) | [暗](screens/after/admin-editor-dark-768.png) | [比較](screens/after/admin-preview-768.png) |
| 1440 | [前](screens/before/editor-1440.png) | [後](screens/after/admin-editor-1440.png) | [暗](screens/after/admin-editor-dark-1440.png) | [比較](screens/after/admin-preview-1440.png) |

画像の新旧比較：[390px](screens/after/admin-image-preview-390.png) / [1440px](screens/after/admin-image-preview-1440.png)。

390pxの初期編集画面の高さは9,567pxから約1,700pxへ縮小（非表示タブ・出典は必要時に展開）。スクリーンショットの数値はfixtureでの測定で、データ量により異なる。

## 検証

- `npm test --prefix admin`：22件。編集ドラフト、nullable値、複数所属/SNS、フィールド差分、検証パス、Lee画像変更の全master不変性を追加。
- `npm run check --prefix admin`：成功。**wranglerのdry-runのみ**。
- `npm run test:worker --prefix admin`：成功。ローカルworkerd/SQLite DOでOAuth→全master検証→模擬PR→再試行。
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser --prefix admin`：320/390/768/1440px、ライト/ダーク、横溢れなし、キーボード、既存/新規編集、出典追加、Wiki出典保持、所属/SNSカード、エラー移動、未保存破棄確認、プレビュー確認ゲート、模擬PR・403後再試行、事務所/グループ編集。
- ルートの `npm run check`、`npm test`、`npm run build`、`CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`：成功。既存配信トップ・Swiper・動画トグル・各静的ページ・JS無効表示・公開allowlistも維持。

## 公開範囲と残存課題

変更はadminの静的UI・テスト・本ドキュメントのみ。認証・権限・CSRF・PR/競合/重複回復・全master検証のサーバーコードとSchemaに変更なし。master、収集処理、公開サイト、Actions、Cloudflare設定にも変更なし。公開サイトのバージョン2.9.1を維持し、未デプロイの私用Admin機能を公開サイトの更新履歴に載せない。

- 外部画像の可用性は保証できない。失敗しても入力値を保持し、画像データのアップロードは行わない。
- 未保存データのローカル永続化・編集の同時共同作業・フィールド単位のGitHub競合解決は範囲外。main更新時は既存の競合検出で止めて再確認する。
- 管理対象の削除/統合等の高度な操作は既存の詳細・影響確認画面を維持。大規模な権限・ワークフロー変更は行っていない。
- 実環境のOAuth/PR作成は実行していない。マージ後のデプロイと実環境スモークテストは所有者が実施する。

Admin静的アセットは31,688→74,707 bytes（約42.0KiB増）。新規フレームワーク・APIリクエスト・公開サイトの配信Artifact増加はない。
