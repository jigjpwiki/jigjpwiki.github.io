# Phase 3へ引き継ぐAPIと状態

既存`api()`で同一origin、HttpOnlyセッション、CSRFを使う。認証/数値allowlist/repo push権限は全APIの前で検証。保存protocol 1と提出protocol 2を混ぜない。入力にmaster/任意file/branch/tokenを渡さない。

## 保存は既存のまま

`GET/PUT /api/workspace`、protocol 1、revision CAS。30日、120操作、512KiB。`before/value/baseCommit/key/entity/id?/parent?`。`validationState=unchecked`は公開承認ではない。既存保存データを移行しない。

## 提出

- `POST /api/submissions/preview`: `{protocol:2,revision,keys,reason?:string|null}`。DOの保存内容を選択し、最新mainと各Base commitのrecordを照合する。Baseの種類は最大4、GitHub呼出45回上限。足りなければ選択を分ける。
- 成功: `{protocol:2,id,state:'ready',confirmationHash,baseCommit,title,summary,records,dependencies,diff}`。10分有効。同一の選択内容/sha/owner/理由では同じID・確認hashを再利用する。操作の選択順はID生成から除外する。
- 競合: HTTP 200、`state:'conflict'`、`conflicts:[{key,entity,id,field,base,ours,theirs}]`、`currentRecords:[{key,before,value}]`、`baseCommit`。他の下書きを破棄しない。各fieldの採用値を選択し、最新のbefore/baseCommitと解決済みvalueをworkspaceへCAS保存して再previewする。mainから削除されたrecordは自動復活させない。
- `POST /api/submissions`: `{protocol:2,previewId,confirmationHash}`。開始前に再度main SHAを検査。owner専用のjournalから同じbranchへ復旧。GitHubのPR番号/URLが確認できるまでsubmittedにしない。
- 成功した選択key＋操作hashだけを保存済みworkspaceから除外。提出時revisionが進んでいても、一致しない新しい編集は残す。全削除や古いsnapshotによるworkspace上書きは行わない。

状態は保存状態と別管理。previewはready/conflict、提出記録はsubmitting/submitted/failed。理由は空欄ならnull、架空の理由を書かない。人間の差分確認checkboxと確認hashは必須。削除/統合の旧経路は名前＋ID確認も維持する。

## 提出済みPR

- `GET /api/submissions?cursor=0`: ownerの新形式記録を20件ずつ、直近100件まで。GitHubから直近50件のmain向けPRも60秒cacheで取得し、`admin/change-*`かつ同一repoのみ旧形式として表示（既存#42も読み取り専用）。新形式記録を重複表示しない。古い履歴はGitHubと監査ファイルに永久保持、DO詳細は180日。
- `GET /api/submissions/:id` / `?refresh=1`: owner確認後、PR/check-runs/status/required checksを取得。60秒cache、自動pollなし。requiredチェックの取得不能/未完/未知/ページ不足は「マージ可能」にしない。check名だけでなく必須integrationのapp IDも照合する。
- 詳細は差分/PRリンク/CIジョブリンク/競合を表示。API失敗時は画面に残る古い「マージ可能」表示も取得不能へ変更する。
- `GET /api/submissions/legacy/:number`: 同一repo/main/Admin branchの旧PRを読み取り専用で表示。元の再適用batchがないPRのbranchを推測で更新しない。

## PRブランチ再適用

- `POST /api/submissions/:id/update-preview`: `{protocol:2,resolutions?:[{key,field,choice:'ours'|'theirs'}]}`。open/未merge、同一repo、main base、既知のhead SHA、ownerのbatchに限定。mainの新しい値へ再適用し全検証する。元auditは不変、更新auditを別IDで追加する。最新mainに既にある監査fileが保存版と食い違えば拒否する。
- `POST /api/submissions/:id/update`: `{protocol:2,confirmationHash}`。head/main/確認hashを再検査。最新main treeを基に生成し、旧headと最新mainを親にするcommitを`force:false`でfast-forward更新。GitHub ref APIにはexpected-old-SHA引数がないため、この親関係＋直前照合で別commitを置換しない。
- 自動生成のタイトル/本文が保たれている場合は新しいID/差分サマリーへ更新する。人間が編集したPR文は保持。確認後の文面変更も再照合し、勝手な上書きを避ける。
- ref書込前にcommitをjournal化。応答消失後はそのcommitがPR headになっていることを確認して復旧し、同じcommitを再生成しない。進行中の更新cacheは180日保持し、未着手のpreviewは10分で失効する。
- 他人のcommit、異なるrepo/base/branch、closed/merged、不明なhead、意味的矛盾は拒否。mainへ書かず、force push/自動mergeもしない。

## 共通UI部品

`mountSubmissions()`がChanges/ChangeReview/ConflictResolution/SubmissionList/SubmissionDetailを構成する。Phase 3はAppShell/DataTableから同じworkspaceとAPIへ接続する。`operationDependencies()`はブラウザー/Worker共用。新IDはプレビュー時の最新台帳で発行し、一時参照を全件同時に解決する。名前から同一人物・楽曲を推定しない。配列はfield単位で原子的に扱い、安全に対応付けられない要素を自動mergeしない。

## 監査と互換経路

`ops/admin/audit/<batchId>.json`はサーバー生成。version 2、actor、createdAt、baseCommit、reason|null、submissionId、branch、operationId/entity/recordId/action/changedFields/before/after。Schema相当の厳密なshape検証をWorkerとroot checkで共有し、既存auditの変更/削除はPR差分のCIでも拒否する。GitHub自体の書込権限に対する署名基盤を追加するものではない。

旧`/api/change-requests`も理由任意・新auditへ移行。新規legacy planはsourceFreeProtocol 3/auditProtocol 2（contentProtocolはundefinedまたは1）で旧Workerへの送信を防止。既存の古いpreview/journalはそのまま復旧できる。過去ledger entriesは削除/移行しない。`issuedOrganizations`やWiki除外等の業務設定が変わる旧操作のみledgerの該当設定変更を保持し、監査entriesは追記しない。新Workspace経路の組織ID予約は既存catalog registryを使う。

一括planの暗号化前JSONは約1.4MBまで（base64暗号文をSQLiteの単一rowへ収める）。workspaceの上限は変更しない。選択全体が大きすぎる場合は分割を要求し、部分保存/部分PRは作らない。API/validation診断は分類だけで、OAuth token/Secrets/HTTP response全文を保存しない。

「マージ可能」はGitHubの`mergeable_state=clean`、classic必須チェック、適用中rulesetの必須チェック、取得できた全CIが揃う場合だけ表示する。integration IDも確認する。merge queueや未対応の必須workflow、保護設定が読めない場合は断定しない。Checks/Commit statusesの読取権限が足りなくてもPR自体の情報は表示し、CIは取得不能として扱う。新GitHub Appは不要だが、既存Appの読取権限が不足する場合は所有者が別途確認する（本PRで権限/Secretsを変更しない）。

選択preview/submitのrequestは16KBまで、PR更新の競合選択は512KiBまで。旧previewの100KB/60操作上限は変更しない。大きな旧画面の一括操作は新しい「変更内容」から選択提出する。
