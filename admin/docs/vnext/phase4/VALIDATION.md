# 検証範囲・測定方法・残存課題

## Fixtureと最新マスターの分離

| 対象 | 方法 |
| --- | --- |
| ビジネスルール/固定回帰 | tests/fixtures/admin-vnext-baseline.json（main 0ffeee53c時点17ファイル）。Admin baselineModels()はdeep clone。rootの歴史fixture・review hash検証は維持 |
| 公開ページ固定回帰 | tests/fixtures/browser-site.cjsが最新rendererを一時コピーし固定データでbuild。実際の_site/本番マスターを上書きしない |
| 現行Schema/参照/非公開保護 | 既存root check/test/buildを現在のdataで実行。新規current-site.browser.cjsは現在の全公開詳細URLと6幅/JS有無を検証 |
| 正規の将来Admin編集 | prospective.testは現在のマスターで人物・組織・グループ・記念日・音楽・動画・イベント・キャンペーン・商品を編集/追加し、一時repoのroot checkと全195テストが通ることを確認。過去reviewを書き換えない |
| 不正データ | 同じ一時repoへ人物ID重複を入れるとcheckが失敗する。従来のURL/ID/参照/非公開/認証等の拒否テストを維持 |
| 現行Admin UI | quality.browserは現在の全マスターの一時コピー。13種編集と新規関連参照、A〜E、認証期限/別owner拒否をmock OAuth/GitHubで検証 |

テストのskip・Schema緩和・過去review hash無効化は行っていない。固定fixtureは「現物データを固定値に戻す」ためのものではなく、規則を再現する入力。現在データも別経路で必ず検証する。

## 性能

Node24/Linux・Chromium、1440x1000、外部画像遮断。ブラウザー内の実DataTable/columns/関連投影を使い、1k VTuber/5k記念日/2kイベント/5k商品/10k歌唱/5kOfferを試験用に生成。全検索/フィルター後も50行DOMが存在することをassert。JS performance.nowで初期描画・検索・フィルター・ソート・ページ・セル編集を計測。CDP JSHeapUsedSizeを取得。目標は初回1.5秒未満、各操作1秒未満、JS heap128MiB未満。

数値は[JSONレポート](quality-report.json)。Beforeは実Phase3のフロントエンド。OfferのみBefore250件、After5000件であり、同条件の速度倍率は算出しない（旧実装5000件の反復コピーは高コスト）。UI描画の計測であり、ネットワーク/main取得/本番WorkerCPUを含むエンドツーエンド性能ではない。

保存・PRは実Worker関数+mock GitHubの経路で要求バイト数・応答時間・GitHub要求数を記録。現行mainの全ファイル取得を含むためカテゴリ別の純粋処理時間ではない。workerd/SQLiteでは120操作375,981bytesを保存、runtime再起動後保持、121操作拒否、旧保存維持、preview検証失敗時のGitHub無書込みを確認。最大512KiB/120操作/30日を緩和しない。100件は60+40の2PRへ分割して提出。

## A〜E実操作

[quality-report.json](quality-report.json)に各シナリオの実測時間・クリック数・通信量・最大GitHub要求数・想定した障害を記録。テキスト入力/キー操作を全てクリック数へ換算してはいない。テスト実行時間には自動保存待ち等を含む。

A: 状態5/記念日5/イベント5/商品5を保存・再読込・1PR。B:5件提出後15件保持、別変更を追加して2PR目。C:main同一フィールド競合を明示選択・再プレビュー。D:保存429とGitHub側成功後の応答消失、重複PRなし。E:100件の実セル編集、保存、一括確認、60+40提出。実GitHub/Cloudflare本番へは書き込まない。

## アクセシビリティ・画面

6幅で全10主要画面、ライト/1024pxダーク、document横overflowなし、native table/ラベル/状態AX tree、skip link、矢印/Enter/Esc/Tab/ダイアログの既存回帰を確認。テーブル内の横スクロールは小画面で保持。720 CSS pxによる1440pxの200%相当reflowも検証（ブラウザー実ズーム認証の代替ではない）。代表スクリーンショットを目視し、PCの行密度・モバイルの折返し・ダークの視認性を確認。

**未検証**: NVDA/VoiceOver等実支援技術、全状態のコントラスト実測、全機能のWCAG 2.2 AA適合、本番CloudflareCPU/無料枠残高/実設定・現行Version、実認証/実GitHub APIでの運用。完全適合や本番性能保証とは表記しない。所有者が[導入手順](DEPLOY.md)に沿って実機/実設定を確認する。本PRは本番デプロイ準備まで。

## 実行コマンド

root: npm run check / npm test / npm run build / npm run test:browser（8スイート）。Admin: npm test（81件）/ npm run check（build+dry-run）/ npm run test:worker / npm run test:browser（既存+Phase3+Phase4）。最終CI状態はPRのChecksを正本とする。

再現: CHROMIUM_PATH=/usr/bin/chromium ADMIN_QUALITY_ONLY=1 ADMIN_QUALITY_DIR=admin/docs/vnext/phase4 node admin/tests/content.browser.mjs（rootから）。通常CIは画像を生成しない。画像・fixture・レポートはPagesへ公開しない。
