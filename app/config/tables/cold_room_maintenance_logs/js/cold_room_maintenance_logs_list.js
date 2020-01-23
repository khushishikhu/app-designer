/**
 * This is the file that will create the list view for the table.
 */
/* global $, odkCommon, odkData, odkTables, util, listViewLogic */
'use strict';

var listQuery = 'SELECT * FROM cold_room_maintenance_logs JOIN cold_rooms ON cold_rooms._id = ' +
    'cold_room_maintenance_logs.cold_room_id WHERE cold_room_maintenance_logs._sync_state != ?';

var listQueryParams = [util.deletedSyncState];
var searchParams = '(cold_room_maintenance_logs.technician_name LIKE ?)';

function resumeFunc(state) {
    if (state === 'init') {
        // Translations
        var locale = odkCommon.getPreferredLocale();
        $('#showing').text(odkCommon.localizeText(locale, "showing"));
        $('#of').text(odkCommon.localizeText(locale, "of"));
        $('#prevButton').text(odkCommon.localizeText(locale, "previous"));
        $('#nextButton').text(odkCommon.localizeText(locale, "next"));
        $('#submit').val(odkCommon.localizeText(locale, "search"));

        // set the parameters for the list view
        listViewLogic.setTableId('cold_room_maintenance_logs');
        listViewLogic.setListQuery(listQuery);
        listViewLogic.setListQueryParams(listQueryParams);
        listViewLogic.setSearchParams(searchParams);
        listViewLogic.setListElement('#list');
        listViewLogic.setSearchTextElement('#search');
        listViewLogic.setHeaderElement('#header');
        listViewLogic.setLimitElement('#limitDropdown');
        listViewLogic.setPrevAndNextButtons('#prevButton', '#nextButton');
        listViewLogic.setNavTextElements('#navTextLimit', '#navTextOffset', '#navTextCnt');
        listViewLogic.showEditAndDeleteButtons(true, 'cold_room_maintenance_logs');

        var dateSrvTxt = odkCommon.localizeText(locale, "date_serviced_no_colon");
        var crIDTxt = odkCommon.localizeText(locale, "cold_room");
        var actionsTakenTxt = odkCommon.localizeText(locale, "actions_taken_no_colon");

        listViewLogic.setColIdsToDisplayInList(dateSrvTxt, 'date_serviced',
            crIDTxt, 'cold_room_id', actionsTakenTxt, 'actions_taken');
    }

    listViewLogic.resumeFn(state);
}

function clearListResults() {
    listViewLogic.clearResults();
}

function prevListResults() {
    listViewLogic.prevResults();
}

function nextListResults() {
    listViewLogic.nextResults();
}

function getSearchListResults(){
    listViewLogic.getSearchResults();
}

function newListLimit(){
    listViewLogic.newLimit();
}