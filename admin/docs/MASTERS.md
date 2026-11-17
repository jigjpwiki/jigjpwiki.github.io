> Admin vNext 5: [最新の操作・公開制御・検証・導入手順](vnext/phase5/README.md)。通常一覧は全件連続表示、一括編集表のみページングを維持。以下は過去段階の記録を含みます。

> 現行Admin vNext Phase 4の操作・検証・本番導入は[統合ガイド](vnext/phase4/README.md)を参照。以下は旧段階の記録を含み、件数・画面・試験結果は当時のものです。現行テーブルは50行ページングです。

> 記念日・音楽・イベント・グッズ管理の追加仕様は[コンテンツ管理](content/README.md)を参照。以下の既存VTuber・組織・グループ仕様も引き続き有効。

# VTuber・組織・グループ管理（出典管理廃止後）

現行の管理仕様。出典管理の移行・旧PRの扱い・必須デプロイ順序は [出典管理廃止](../../docs/source-retirement/README.md) を参照。Cloudflare/既存配信Worker/Secrets/Wikiは自動変更しない。

## 画面・操作

GitHubログイン→管理トップ→VTuber/事務所/グループ一覧（30件/ページ）→検索・複合絞り込み→詳細→項目別フォーム→変更内容と理由の確認→差分・参照影響preview→明示的にPR作成→GitHubのPR URL→ログアウト。新規VTuberも同じ経路。名前/ID、所属事務所（旧所属含む）、グループ、活動状態、所属状態、YouTube ID、Wiki有無、情報不足で検索。ID参照索引は一度作り、毎行マスターを全巡回しない。スマートフォン/PC、ダークモード、キーボードfocus、日本語入力、画像取得失敗時は名前/IDを保持する。

フォームはSchemaの項目を個別入力し、巨大JSONの直接編集はさせない。複数SNS/別名/所属履歴/不明nullを扱う。公式URL投入はネットワーク取得をせず、YouTube /channel/ のIDまたは/@handle（ID=null）を候補にする。プロフィール名・所属・活動状態をURLや配信頻度から推測しない。任意URLのサーバー取得/スクレイピング/制限回避はない。YouTube API消費0。

出典の入力・選択・紐付けは廃止。変更内容は全体hashに結び付けて確認し、フォーム値を変えると確認checkboxを解除する。操作者・理由・操作日時・変更フィールドは非公開のops/admin/ledger.jsonへ記録する。新しい監査エントリーに出典URLや確認日は保存しない。旧データの履歴はGitHubへのリンク、管理操作履歴は詳細に表示する。

## 変更処理

GitHub App user tokenで毎回数値user IDとrepository push権限を確認。固定repo/mainの同一commit/treeから全mastersと3つのreadonly feed/cacheを読む（17 blobs＋ref/commit/tree、認証含め約22 API要求）。変更はtyped operationのみ。previewでroot既存validateTalents/validateCatalog/validateEvents/validateMusic/validateKaraokeを再利用し全体検証。AJVはbuild時にstandalone化、Workerでnew Function/eval、Node fs、子プロセスを使わない。Node用の外部楽曲identity検証も純粋モジュールへ切り出し、既存の挙動は維持する。

新IDは発行済み台帳の最大値から発行し、tal/groupは既存台帳、orgは私有管理台帳へ保持。削除後も発行履歴を残す。同名だけでは統合せず、重複するYouTube ID・予約済み本人anchorは拒否。同じ公式個別プロフィールの新IDも、チャンネルで独立確認できない場合は保留。

main SHAが変わったら**保守的にreload/再確認を要求**し、自動で三方mergeしない（配信データ更新だけでも再previewが必要）。previewは10分・操作者にbindし、同じ入力は同じpreview/branchキーを再利用。POSTの二重送信・応答不明はSQLite journal、固定admin/change- namespace、既存PR照合で回復。途中のplan/commitは最大24時間保持し、preview期限後も同じpreview IDの再送で回復可能。リポジトリ名/ファイルpath/branchを入力で指定できず、mainやrelease branch、アプリコード、任意workflowへの書込は不可。readonly cache/feedは書込allowlistに含めない。403/409/422/429/ネットワーク障害はremote本文を返さず停止する。

## 4つの独立状態・破壊操作

- 掲載：talent.visibilityを後方互換追加。省略はpublicで既存97名を非公開にしない。draftは公開talent JSON/個別ページ/検索/sitemapから除外し。出典情報を除く登録内容と公開制御を維持する。**ID参照が残る非公開化は保留**し、歴史イベント/歌唱等を無断で消さない。現段階は参照のないレコードのみ非公開化できる。既存の収集カード/キャッシュを匿名化する機能ではない。
- 配信収集対象：YouTube/Twitchの既知アカウントIDで既存targets JSONへのinclude/excludeを独立PRにする。勝手なID/ハンドル解決、cache削除、取得処理・頻度変更はない。掲載状態と一括変更するUI/APIは作らない。
- 管理レコード：非公開でも保持。完全削除は本人名＋IDの再確認を要求し、全master ID/アカウント/監視対象/cache/feed参照が残れば拒否する。発行台帳は消さない。誤削除の復元はGitレビューで旧IDを使い、新IDとして再発行しない。
- Wiki管理対象：私有ledgerのwikiExclusionsで別管理。**他リポジトリの本番Wiki同期やWikiそのものは変更しない**。外部同期への適用は別途レビューが必要。

重複統合ではtarget IDを維持、source IDを台帳に予約したまま、メンバー・イベント・出演枠・楽曲動画・歌枠・歌唱記録・商品等の参照をtargetへ置換する。別名/アカウントを保持。所属履歴や活動状態が食い違う場合は先に人間が解決するまで拒否する。所属履歴の丸ごと削除も拒否する。統合・削除は変更理由と差分をPRで人間がレビューする。独立した旧URLリダイレクトや自動的な履歴マスキングは今回実装しない。

## 公開・バージョン

管理アプリと台帳/Schema/候補/SecretはPages allowlistへ追加しない。出典管理の撤去に伴う公開表示変更をAGENTS.mdに従い2.12.0へ更新する。管理アプリのデプロイは所有者が別途行う。既存のイベント5件/商品41件/配信トップUIを保持。現物マスターに人物/組織/所属/活動状態の変更はない。

## 検証と導入

rootでnpm ci、adminでnpm ci。rootのcheck/test/build/test:browserに加え、adminのnpm test（認証/編集/ID/参照/競合/403・409・422・429/応答不明復旧）、npm run check（dry-run）、npm run test:worker（workerd＋SQLite DOでmock OAuth→実際の全master static validator→preview→mock PR→重複再送）、npm run test:browser（ローカルfake OAuth/GitHub、320/390/768/1440px、新規/編集/PR失敗再試行/ログアウト）を使う。実GitHub書込・実Cloudflare・課金・Wikiへの副作用はない。

静的bundle約700KiB（gzip約71KiB、今回のdry-run計測）（圧縮はdry-run出力参照）。本番の無料枠残高/実CPU/実App設定は所有者が確認する。既存Cloudflareアカウントで、複数アカウントを使う所有者はCLOUDFLARE_ACCOUNT_IDに**既存**IDを指定して対象を明示する。新規アカウントは不要。callback/client ID/numeric user IDs、jigwiki-admin専用のClient Secret/SESSION_KEY、ADMIN_ENABLEDの設定だけ。デプロイは所有者承認後のみ。詳細はSETUP.md。

B/Cへはowner以外のrole、候補一括承認、監視・API予算ダッシュボード、外部Wiki同期policy連携、参照付きレコードの匿名化・公開履歴維持方針を引き継ぐ。今回の安全側の保留を無条件に外さない。

今回の実行結果：admin単体/結合27件成功、公開サイト185件成功、check/build/既存browser成功。workerd/SQLite DOではmock OAuthからstatic Schema全体検証・PR作成・二重送信まで成功。管理E2Eは4画面幅で新規と編集を各1回、320pxではPR403失敗→再送も確認。スクリーンショット: [詳細390px](screens/admin-detail-390.png)、[詳細1440px](screens/admin-detail-1440.png)、[PR結果390px](screens/admin-result-390.png)、[PR結果1440px](screens/admin-result-1440.png)。ローカルfixture認証であり、本番GitHub/Cloudflareへは書き込んでいない。
