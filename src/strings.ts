// Copyright (c) 2024 Kichikuou <KichikuouChrome@gmail.com>
// Licensed under the MIT License. See the LICENSE file for details.

const dictionary_en = {
    drag_and_drop_a_folder: 'Drag and drop a folder.',
    error_occurred: 'An error occurred.',
    file_write_error: 'Failed to write file.',
    installation_finished: 'Installation finished',
    no_game_data_in_zip: 'No game data found in the ZIP file.',
    not_a_zip_file: 'Please select a ZIP file.',
    no_game_installed: 'No game is installed.',
    not_savefiles_for: (gameName: string) => `Not save files for ${gameName}.`,
    restart_confirmation: 'Unsaved data will be lost.\nRestart the game?',
    saves_imported: 'Save files imported.\nRestart the game?',
    system3x_game: 'This is a System3.x game. Please use Kichikuou on Web.',
    unsupported_browser: 'This browser is not supported. iOS/iPadOS 17 or later is required.',
};
type Dictionary = typeof dictionary_en;

const dictionary_ja: Dictionary = {
    drag_and_drop_a_folder: 'フォルダーをドラッグ＆ドロップしてください。',
    error_occurred: 'エラーが発生しました。',
    file_write_error: 'ファイルの書き込みに失敗しました。',
    installation_finished: 'インストール完了',
    no_game_data_in_zip: 'ZIPファイルにゲームデータが見つかりません。',
    not_a_zip_file: 'ZIPファイルを選択してください。',
    no_game_installed: 'ゲームがインストールされていません。',
    not_savefiles_for: (gameName: string) => `${gameName} のセーブデータではありません。`,
    restart_confirmation: 'セーブされていないデータは失われます。\nゲームを再起動しますか？',
    saves_imported: 'セーブデータを取り込みました。\nゲームを再起動しますか？',
    system3x_game: 'System3.xのゲームです。鬼畜王 on Webをご利用ください。',
    unsupported_browser: 'このブラウザでは動作しません。iOS/iPadOS 17以上が必要です。',
};

const dicts:{[language: string]: Dictionary} = {
    en: dictionary_en,
    ja: dictionary_ja
};

function selectDictionary(): Dictionary {
    let lang = document.documentElement.getAttribute('lang');
    if (lang && dicts[lang])
        return dicts[lang];
    return dictionary_en;
}
export const dictionary = selectDictionary();
