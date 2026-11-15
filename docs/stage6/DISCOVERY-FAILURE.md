# 43724750079 の途中停止と修復

## 確認した根拠と限界

対象：[手動実行](https://github.com/jigjpwiki/jigjpwiki.github.io/actions/runs/43724750079)。最新main `b455fbbb7`から作業。ログでは旧CLIの一般エラーのみ、Artifactでは26要求/26推定単位、199動画、12チャンネル、66候補、rotation=12、未完了jobが1つ、pending=null、retries=0/errors=1。APIキーやレスポンス全文を調査報告へ複製していない。取得した元Artifactはワークスペース内に保持し、リポジトリに追加していない。

チャンネルID順の13番目は白銀ヘレナ（tal-000084 / UC9wTdox728Y2lp3WR7dhoVw）。未完了jobのハッシュもこのチャンネルの日次jobと一致する。直前12チャンネルのplaylist処理済みだが13番目はpending未設定なので、停止段階はuploadsページ取得またはその直後の検証に絞られる。

同じ公式uploadsプレイリスト `UU9wTdox728Y2lp3WR7dhoVw` を1回再取得し、**playlistItems.list HTTP404 / playlistNotFound**を確認した。旧コードはこのエラーで全体を停止する。元Artifactから当該応答を模擬再生すると同じ処理位置で旧コードが停止することも確認した。

**根本原因は、一つのuploadsプレイリストが取得できない場合も全体失敗として扱っていたことと、その具体的診断を捨てていたこと。** 元の実行時点のHTTPステータス/理由は保存されていないため、当時のサーバー応答そのものが404だったことは直接証明できない。再取得で再現した404は、停止位置・再試行0と整合する。プレイリストが存在しない理由（削除/非公開/一時障害/チャンネル状態）は未確認であり、卒業・引退とは解釈しない。

## 修正

- discovery専用transportで、既存の20秒タイムアウト・サイズ制限付きrequestJsonを利用し、非成功応答から**固定allowlistに一致するreasonコードだけ**抽出する。APIエラーメッセージ、応答本文、リクエストURL、認証値は保持/出力しない。既存の配信収集transportは変更しない。
- report.failuresとCLIのJSON診断に stage / classification / scope / endpoint / httpStatus / reason / channelId / talentId / videoId を記録。識別子は所定パターンの公開IDだけ。reason不明時はnull。失敗診断は最大100件。
- channels/playlistItemsの404、invalidPageTokenはチャンネル単位でスキップ。jobのカーソル・pendingを保持して後続へ進め、日次ローテーションで後日再試行する。uploadsキャッシュやマスターを削除しない。
- クォータ、認証・権限、不明なAPI拒否、ネットワーク/429/5xxの再試行枯渇は全体停止。403をチャンネル固有の問題と推測して大量に要求し続けない。再試行も既存の回数/予算内。
- 動画のID/必須フィールド/候補Schema異常は安全なIDと段階を記録。正常な同一バッチの動画は保存し、異常IDは未解決のpendingページとして保持する。再開時は正常動画のキャッシュを再利用し、重複登録しない。
- チャンネル/動画単位の失敗でもreport.errorsを増やし、stopReason=partial_failure（別の上限に達した場合はその理由）とする。CLIは非0終了してActionsの失敗通知を維持する。後続を処理したことを全成功と誤表示せず、lastSuccessAtも進めない。全体停止時はfetch_failed。

### 診断例

```json
{"stage":"uploads_page","classification":"resource_not_found","scope":"channel","endpoint":"playlistItems.list","httpStatus":404,"reason":"playlistNotFound","channelId":"UC9wTdox728Y2lp3WR7dhoVw","talentId":"tal-000084","videoId":null}
```

## チェックポイントと再開

schemaVersion=1のまま既存Artifact/キャッシュを読み込める。キャッシュkey・保存方法・日次予算は変更しない。旧実行の26単位は同じPacific日で引き継ぐため、その日に新たに使える既定予算は34単位。既存の199動画・66候補を初期化しない。元Artifactを削除・編集しない。

同じチェックポイントを復元して再実行すれば、rotation=12から再開する。404対象を記録して後続へ進み、対象の未完了jobは残す。部分失敗が残る間はActionsが赤くなるのは意図した動作で、全チャンネル処理が止まった意味ではない。report.channels/skippedChannels/failures/stopReason/lastSuccessAtを確認する。

元Artifactの模擬再開テストでは、同じ404を1件記録後に後続19チャンネルを処理した。既存66候補と199動画メタデータはdeepEqual、キー重複なし、元Artifactのバイト列も不変。後続の空playlist応答はfixtureであり、実APIで新たに19チャンネルを収集したという主張ではない。実API追加利用は診断用playlistItems.listの1回（推定1単位）のみ。

## 検証・変更しない範囲

追加テスト：404と次チャンネル継続/再試行、クォータ・キー・権限で全体停止、reasonのallowlistと秘密情報除外、動画データ異常、正常/異常が混在するバッチの保存と再開。

`npm run check`、`npm test`、`npm run build`、`CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`を実行する。既存の配信取得コード/監視対象JSON/公開マスター/公開UI/公開ジョブ/Secrets/バージョン2.8.0は変更しない。候補キュー自体も更新しない。mainへの直接push・PRマージ・本番実行は行わない。

ローカル最終検証はcheck/単体131件/build/全ブラウザースイート成功。既存公開マスターとVersion 2.8.0、配信取得・公開ジョブに差分がないことを確認した。
