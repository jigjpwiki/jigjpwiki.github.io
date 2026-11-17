# Admin vNext Phase 4

main `0ffeee53c`（#43・#44・#45マージ済み）からの独立した品質改善。公開マスター・公開UI・収集処理・OAuth/DO/Schema/protocol・本番設定は変更しない。公開サイトのVersion 2.13.0は維持する。

## 改善

- フィルター外・別ページの選択対象を名前で確認し、「選択中のみ表示」で再確認できる。一括変更は全対象を事前計算し、失敗時は全体拒否・入力維持。確認中に対象が変わった場合も拒否。
- 関連レコードの読み取り投影を編集単位でキャッシュし、ID索引とJST formatterを再利用。50行ページングを維持し、新しいフレームワーク/仮想スクロールは導入しない。
- 未完成下書きの欠損日付で一覧が停止しない。不明年を補完しない。
- セッション期限切れで原タブの入力を維持し、別タブで同じ管理者としてログイン後、新しいCSRFで再保存。別owner/repositoryへの下書き移転は禁止。
- 共有ワークスペース内の新規/改名済みVTuber・事務所・グループを名前で参照できる。投影値を編集baselineへ混入させない。
- 内部カテゴリ移動の不要な破棄確認を除去。ページ離脱/未確定セル/提出中/ログアウトの保護は維持。

## 検証資料

- [監査・修正一覧](AUDIT.md)
- [測定・試験範囲と残存課題](VALIDATION.md)
- [管理者向け操作ガイド](GUIDE.md)
- [所有者向け導入・切戻し](DEPLOY.md)
- [性能・A〜E実行レポート](quality-report.json)、[変更前性能](before-performance.json)

| 画面 | Before | After |
| --- | --- | --- |
| 記念日 PC | [1440px](screens/before-anniversaries-1440.png) | [1440px](screens/after-記念日-1440.png) |
| 選択対象 PC | [1440px](screens/before-selection-1440.png) | [選択・競合解消](screens/after-conflict-1440.png) |
| モバイル | [390px](screens/before-anniversaries-390.png) | [390px](screens/after-記念日-390.png) |
| ダーク | — | [1024px](screens/after-音楽-1024.png) |
| ワイド | — | [1920px](screens/after-VTuber-1920.png) |
| 保存エラー/認証期限 | — | [保存失敗](screens/after-save-error-1440.png)・[再認証](screens/after-expired-session-1440.png) |

全10主要画面を320/390/768/1024/1440/1920pxで撮影。画像はモック認証・現行マスターの一時コピーで、公開Pages artifactには含まれない。
