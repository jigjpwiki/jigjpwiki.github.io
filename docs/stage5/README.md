# 第5段階の調査・実装記録

## 調査時の基盤

main `e746ace86`、#15はマージ済み。97名のtal-IDはtalent-id-registry、org-IDはtalentsの組織一覧、group-IDはcatalogとcatalog-id-registryで保持。既存人物や監視JSONは変更しない。新しいイベント等のIDだけfeature-id-registryに発行する。

YouTube JSONはvideoId、youtubeid（channel ID）、title、date、status、type、URLを保存し、説明欄は破棄する。取得処理はvideos.listのsnippet/liveStreamingDetailsを利用するが、アーカイブはJST当日の3日前〜6日後の範囲だけを保持する。過去の動画・説明欄の台帳には流用できないため、確認済みmedia/videosを別管理し、YouTube IDを一意のキーとして再利用する。定期収集は変更しない。公開/削除/不明は確認済み可用性として保持し、過去のイベント・歌唱履歴とは分ける。

既存の記念日とグッズはAjvによる形と参照の検証後に静的生成し、公開allowlistとmanifestに組み込まれる。同じ流れで新しいページと必要な公開JSONのみを生成する。候補・台帳・Schema・fixturesは公開しない。

既存のプロフィール、カード、共通ナビ、静的HTML＋補助JS、検索の表記を再利用する。配信トップはナビのリンクとリリース情報以外を維持する。ニュース機能は追加しない。

## 参考サイト（各入口1ページのみ）

- milpr.vstreams.app/ja/music、utawaku-portal.com：HTTP 403。取得を強制せず、UIやデータを見たとは主張しない。
- seesaawiki.jp/kmnzwiki/歌枠：接続エラーで未取得。回避や再収集なし。
- uyu.studiohal.net/music：HTTP 200、静的入口から「楽曲・歌枠データベース」という目的を確認。主画面はJSのため詳細データは未収集。他サイトのセットリストは取り込まない。

以下の検索、曲・アーティストの識別、配信と歌唱の分離はユーザー要件に基づく独立設計で、参考サイトの大量複製ではない。

## PR A：イベント基盤

- `/events/`、`/events/{id}/`、タレントの関連イベント、共通ナビ。
- 公開データ2件：Palette Project 6th One Man Live -Make it Luminous-、天透あわの初めての新髪型お披露目。
- [公式特設サイト](https://paletteproject.jp/makeitluminous/)で2026-12-26 18:00〜20:00 JST、会場、通常券8,500円を確認。Castの各リンクをID台帳の公式プロフィールURLへ照合して8名を登録。主催法人名やオンライン配信先は推測せず未登録。別券種/条件は購入先へ誘導。
- [本人公式配信](https://www.youtube.com/watch?v=-kR7Kqqy6Vs)でchannel IDをtal-000036へ照合。動画タイトル・説明から特別企画と判断し、3Dと誤分類しない。実配信の開始/終了はliveStreamingDetails、動画長はcontentDetailsから確認。両者には配信/アーカイブ編集による差があり得るため同一視しない。
- 時刻はinstant/date/month/unknownを区別。日付だけの場合に0時を補完しない。予定/実施も別管理。単発イベントはanniversariesに追加しない。
- リレーは複数slot-ID、出演者、時刻、配信先を持てる。初期の実在リレー枠は未登録で、複数枠と不明時刻は非公開fixtureで検証する。
- sourcesは公式/Wikiと確認日時を区別。公開イベントから未検証のdraft動画/グループを参照できず、根拠・台帳・URL・期間の不整合でビルドを止める。公開への射影では使う出典/動画だけを出す。

初期データの確認はvideos.list 1回（7動画を一括、後続B/Cの調査対象も含む）と公式特設サイト1ページ。新しい定期API呼び出しは0。音源・動画はダウンロードせず、歌詞全文や他サイトのセットリストを保存しない。

## バージョン情報の管理

調査時はindex.htmlのVersion 2.5.2と資産の`?v=2.5.2`、data/update_info.jsonの更新文が別管理。git履歴でも2.5.1→2.5.2、旧版には2.4.5-betaという3桁形式が使われていた。ロードマップ名「jigdule 3.0」を根拠に独立した番号を推定せず、既存の3桁形式を維持する。

Aは2.6.0としてイベントだけを案内する。今後の機能追加はminor、修正はpatchとする規則を今回AGENTS.mdで明文化。data/release.jsonを一元的な正本とし、フッター、更新バナー用data/update_info.json、CSS/JSのキャッシュ番号を静的ビルドで生成する。生成元としての旧update_info.jsonは削除し、表示先のURLとバナー制御は変更しない。データ追加や定期収集だけではバージョンを上げない。

npm run checkはCIのPR base（必要ならそのcommitのみread-only fetch）との変更を調べ、訪問者向け実装に変更があるのに番号/更新文が同じなら失敗する。純粋なデータ変更は許可。featurePathsのページが生成されなければビルドを失敗させ、未実装ページを告知しない。JS無効でもバージョン番号は静的に表示。バナーの閉じる操作と保存は従来処理を維持する。

## 依存関係と対象外

Aはmainがbase。後続B/Cは未マージの依存がある間はdraftとし、前PRがmainへマージされた後にbaseをmainへ変え、Files changedとCIを再確認してからreadyにする。依存ブランチへのマージでは完了しない。本作業ではいずれもマージしない。

Aには音楽ページ、歌唱/セットリスト、タイトル/説明欄からの候補抽出はまだ含まれない。候補からの自動公開、音声/字幕認識、一般投稿やニュース、外部DB/サーバー、有料サービスも導入しない。

### Aの検証結果・画面比較

`npm run check`、`npm test`（93件）、`npm run build`、`npm run test:browser` は成功。320/390/768/1440pxのJS有効/無効、新規リンク・日付/JST・検索と解除・プロフィール往復、PC/スマホのVersion/更新バナーを確認。既存トップの5幅のSwiper/カード/動画トグル/更新失敗復旧テストも成功。リレー・不明日時・draft・XSS・壊れた参照・重複動画・リリース更新漏れはユニットテストで確認。

同じ配信snapshotでmain 292ファイル/37,771,190 bytes → A 298ファイル/37,823,754 bytes（+52,564 bytes）。ビルドは約0.4秒、Pages側の処理は未検証。公開候補/ID台帳/Schema/テスト/docsはArtifactに含まれない。

画像はJST 2026-11-15 12:00固定、配信応答を空fixture、外部画像遮断で比較（本番取得結果やAPI障害の画像ではない）。

| 対象 | Before | After |
| --- | --- | --- |
| スマホのバージョン | [2.5.2](screens-a/before/schedule-390.png) | [2.6.0](screens-a/after/schedule-390.png) |
| PCのバージョン | [2.5.2](screens-a/before/schedule-1440.png) | [2.6.0](screens-a/after/schedule-1440.png) |
| イベント一覧 | mainには未実装 | [390px](screens-a/after/events-390.png) / [1440px](screens-a/after/events-1440.png) |
| イベント詳細 | mainには未実装 | [390px](screens-a/after/events-evt-000001-390.png) / [1440px](screens-a/after/events-evt-000001-1440.png) |
