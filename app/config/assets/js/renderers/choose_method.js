/**
 * Render the choose method page
 */
'use strict';

var actionTypeKey = "actionTypeKey";
var actionBarcode = 0;
var actionRegistration = 1;
var actionTokenDelivery = 2;
var htmlFileNameValue = "delivery_start";
var userActionValue = "launchBarcode";
var barcodeSessionVariable = "barcodeVal";
var chooseListSessionVariable = "chooseList";
var savepointSuccess = "COMPLETE";
var LOG_TAG = "choose_method.js";

// Table IDs

var myTimeoutVal = null;
var idComponent = "";
var user;
var locale = odkCommon.getPreferredLocale();
var superUser;
var type = util.getQueryParameter('type');
var code;
var userKey = "user";
var defaultGroupKey = "defaultGroup";
var entDefaultGroupKey = "entDefaultGroup";


function display() {

    $('#view_details').text(odkCommon.localizeText(locale, "view_authorization_details"));
    $('#barcode').text(odkCommon.localizeText(locale, "scan_barcode"));
    $('#search').text(odkCommon.localizeText(locale, "enter"));

    var barcodeVal = odkCommon.getSessionVariable(barcodeSessionVariable);
    if (barcodeVal !== null && barcodeVal !== undefined && barcodeVal !== "") {
        $('#code').val(barcodeVal);
    }

    var localizedUser = odkCommon.localizeText(locale, "select_group");
    $('#choose_user').hide();
    if (type !== 'ent_override') {
        $('#view_details').hide();
    } else {
        idComponent = "&authorization_id=" + encodeURIComponent(util.getQueryParameter('authorization_id'));
        $('#view_details').on('click', function() {
            odkTables.openDetailView(
                                     null,
                                     util.authorizationTable,
                                     util.getQueryParameter('authorization_id'),
                                     'config/tables/authorizations/html/authorizations_detail.html');
        });
    }

    $('#title').text(util.getQueryParameter('title'));


    user = odkCommon.getActiveUser();
    odkCommon.setSessionVariable(userKey, user);
    console.log("Active User:" + user);

    var userPromise = new Promise(function(resolve, reject) {
        odkData.getUsers(resolve, reject);
    });

    var rolesPromise = new Promise(function(resolve, reject) {
        odkData.getRoles(resolve, reject);
    });

    var defaultGroupPromise = new Promise(function(resolve, reject) {
        odkData.getDefaultGroup(resolve, reject);
    });

    return Promise.all([userPromise, rolesPromise, defaultGroupPromise, populateSyncList()]).then(function(resultArray) {
        var users = resultArray[0].getUsers();
        var roles = resultArray[1].getRoles();
        var filteredRoles = _.filter(roles, function(s) {
            return s.substring(0, 5) === 'GROUP';
        });
        var defaultGroup = resultArray[2].getDefaultGroup();
        odkCommon.setSessionVariable(defaultGroupKey, defaultGroup);

        superUser = $.inArray('ROLE_SUPER_USER_TABLES', roles) > -1;
        if (superUser && type === 'registration' && filteredRoles.length > 0) {
            $('#choose_user').show();
            $('#barcode').prop("disabled", true).addClass('disabled');
            $('#search').prop("disabled", true).addClass('disabled');
            filteredRoles.forEach(addOption);
            $('#choose_user').append($("<option/>").attr("value", localizedUser).attr('selected', true).text(localizedUser));
            $('#choose_user').on('change', function() {
                defaultGroup = $('#choose_user').val();
                odkCommon.setSessionVariable(defaultGroupKey, defaultGroup);
                if ($('#choose_user').val() === localizedUser) {
                    $('#barcode').prop("disabled", true).addClass('disabled');
                    $('#search').prop("disabled", true).addClass('disabled');
                } else {
                    $('#barcode').prop("disabled", false).removeClass('disabled');
                    $('#search').prop("disabled", false).removeClass('disabled');
                }
            });
        }

        $('#barcode').on('click', function() {
            var dispatchStruct = JSON.stringify({actionTypeKey: actionBarcode,
                htmlPath:htmlFileNameValue, userAction:userActionValue});
            odkCommon.doAction(dispatchStruct, 'com.google.zxing.client.android.SCAN', null);
        });
        myTimeoutVal = setTimeout(callBackFn(), 1000);


        $('#search').on('click', function() {
            console.log("USERS: " + users);
            queryChain($('#code').val());
        });

        odkCommon.registerListener(function() {
            callBackFn();
        });

        // Call the registered callback in case the notification occured before the page finished
        // loading
        callBackFn();
    }, function(err) {
        console.log('promise failure with error: ' + err);
    });
}

function addOption(item) {
    $('#choose_user').append($("<option/>").attr("value", item).text(item));
}

function populateSyncList() {
    if (util.getWorkflowMode() === 'TOKEN' || type === 'delivery') {
        console.log('entered delivery sync path');
        let newRows = $('<h3>');
        return new Promise( function(resolve, reject) {
            odkData.query(util.deliveryTable, '_sync_state = ?', ['new_row'],
                null, null, null, null, null, null, false, resolve, reject);
        }).then( function(result) {
            newRows.text('New since last sync: ' + result.getCount());
            $('#sync_list').append(newRows);
        });
    } else if (type === 'registration') {
        console.log('entered registration sync path');
        let newRows = $('<h3>');
        let newRowsPromise = new Promise( function(resolve, reject) {
            odkData.query(util.beneficiaryEntityTable, '_sync_state = ?', ['new_row'],
                null, null, null, null, null, null, false, resolve, reject);
        });
        let updatedRows = $('<h3>');
        let updatedRowsPromise = new Promise( function(resolve, reject) {
            odkData.query(util.beneficiaryEntityTable, '_sync_state = ? OR _sync_state = ?', ['changed', 'in_conflict'],
                null, null, null, null, null, null, false, resolve, reject);
        });

        return Promise.all([newRowsPromise, updatedRowsPromise]).then( function(resultArr) {
            newRows.text('New since last sync: ' + resultArr[0].getCount());
            updatedRows.text('Updated since last sync: ' + resultArr[1].getCount());
            $('#sync_list').append(newRows);
            $('#sync_list').append(updatedRows);
        });
    } else {
        return Promise.resolve(null);
    }


}

function callBackFn () {
    var action = odkCommon.viewFirstQueuedAction();
    console.log('callback entered with action: ' + action);

    if (action === null || action === undefined) {
        // The queue is empty
        return;
    }

    var dispatchStr = JSON.parse(action.dispatchStruct);
    if (dispatchStr === null || dispatchStr === undefined) {
        console.log('Error: missing dispatch struct');
        odkCommon.removeFirstQueuedAction();
        return;
    }

    var actionType = dispatchStr[actionTypeKey];
    console.log('callBackFn: actionType: ' + actionType);

    switch (actionType) {
        case actionBarcode:
            handleBarcodeCallback(action, dispatchStr);
            odkCommon.removeFirstQueuedAction();
            break;
        case actionRegistration:
            handleRegistrationCallback(action, dispatchStr);
            odkCommon.removeFirstQueuedAction();
            break;
        case actionTokenDelivery:
            handleTokenDeliveryCallback(action, dispatchStr);
        default:
            console.log("Error: unrecognized action type in callback");
            odkCommon.removeFirstQueuedAction();
            break;
    }
}

function handleBarcodeCallback(action, dispatchStr) {

    console.log("Barcode action occured");

    var actionStr = dispatchStr["userAction"];
    if (actionStr === null || actionStr === undefined ||
        !(actionStr === userActionValue)) {
        console.log('Error: missing or incorrect action string' + actionStr);
        return;
    }

    var htmlPath = dispatchStr["htmlPath"];
    if (htmlPath === null || htmlPath === undefined ||
        !(htmlPath === htmlFileNameValue)) {
        console.log('Error: missing or incorrect htmlPath string' + htmlPath);
        return;
    }

    console.log("callBackFn: action: " + actionStr + " htmlPath: " + htmlPath);

    if (action.jsonValue.status === -1) {
        clearTimeout(myTimeoutVal);
        var scanned = action.jsonValue.result.SCAN_RESULT;
        $('#code').val(scanned);
        odkCommon.setSessionVariable(barcodeSessionVariable, scanned);
        queryChain(action.jsonValue.result.SCAN_RESULT);
    }
}

function handleRegistrationCallback(action, dispatchStr) {
    dataUtil.validateCustomTableEntry(action, dispatchStr, "beneficiary_entity", util.beneficiaryEntityTable).then( function(result) {
        if (result) {
            var rootRowId = dispatchStr[util.rootRowIdKey];
            if (util.getRegistrationMode() === "HOUSEHOLD") {
                var individualRowsPromise = new Promise( function(resolve, reject) {
                    odkData.query(util.getIndividualCustomFormId(), 'custom_beneficiary_entity_row_id = ?', [action.jsonValue.result.instanceId],
                        null, null, null, null, null, null, true, resolve, reject)
                });

                var rootBERowPromise = new Promise( function(resolve, reject) {
                    odkData.query(util.beneficiaryEntityTable, '_id = ?', [rootRowId],
                        null, null, null, null, null, null, true, resolve, reject)
                });
                console.log("about to execute two promises");
                var addRowActions = [];
                Promise.all([individualRowsPromise, rootBERowPromise]).then( function(resultArr) {
                    var customIndividualRows = resultArr[0];
                    var rootBERow = resultArr[1];
                    console.log(customIndividualRows.getCount());
                    for (var i = 0; i < customIndividualRows.getCount(); i++) {
                        var jsonMap = {};
                        util.setJSONMap(jsonMap, '_row_owner', odkCommon.getActiveUser());
                        util.setJSONMap(jsonMap, 'beneficiary_entity_row_id', rootRowId);
                        //util.setJSONMap(jsonMap, 'date_created', );
                        util.setJSONMap(jsonMap, 'individual_id', rootBERow.get("beneficiary_entity_id"));
                        util.setJSONMap(jsonMap, 'custom_individual_form_id', util.getIndividualCustomFormId());
                        util.setJSONMap(jsonMap, 'custom_individual_row_id', customIndividualRows.getRowId(i));
                        util.setJSONMap(jsonMap, 'status', 'ENABLED');

                        addRowActions.push(new Promise( function(resolve, reject) {
                            odkData.addRow(util.individualTable, jsonMap, util.genUUID(), resolve, reject);
                        }));
                    }
                    return Promise.all(addRowActions);
                }).then( function(result) {
                    if (addRowActions.length > 0) {
                        console.log("added base individual rows");
                        odkTables.openDetailWithListView(null, util.getBeneficiaryEntityCustomFormId(), action.jsonValue.result.instanceId,
                            'config/tables/' + util.beneficiaryEntityTable + '/html/' + util.beneficiaryEntityTable + '_detail.html?type=' +
                            encodeURIComponent(type) + '&rootRowId=' + rootRowId);
                    }
                }).catch( function(error) {
                    console.log(error);
                });
            } else if (util.getRegistrationMode() === "INDIVIDUAL") {
                odkTables.openDetailWithListView(null, util.getBeneficiaryEntityCustomFormId(), action.jsonValue.result.instanceId,
                    'config/tables/' + util.beneficiaryEntityTable + '/html/' + util.beneficiaryEntityTable + '_detail.html?type=delivery&rootRowId=' + rootRowId);
            }
        }
    });
}

function handleTokenDeliveryCallback(action, dispatchStr) {
    dataUtil.validateCustomTableEntry(action, dispatchStr, "delivery", util.deliveryTable).then( function(result) {
        if (result) {
            //any custom UI upon custom delivery success
        }
    })
}

function queryChain(passed_code) {
    code = passed_code;
    if (util.getWorkflowMode() === "TOKEN") {
        tokenDeliveryFunction();
    } else if (type === 'delivery') {
        deliveryFunction();
    } else if (type === 'registration') {
        registrationFunction();
    } else if (type === 'enable' || type === 'disable') {
        regOverrideFunction();
    } else if (type === 'ent_override') {
        entOverrideFunction();
    }
}

function tokenDeliveryFunction() {
    // Could put this reconciliation function throughout the app
    console.log('entered token delivery function');
    var activeAuthorization;

    dataUtil.reconcileTokenAuthorizations().then( function(result) {
        return new Promise(function (resolve, reject) {
            odkData.query(util.authorizationTable, 'status = ? AND type = ?', ['ACTIVE', 'TOKEN'], null, null,
                null, null, null, null, true, resolve,
                reject);
        });
    }).then( function(result) {
        console.log(result);
        activeAuthorization = result;
        if (activeAuthorization.getCount() === 1) {
            return new Promise( function (resolve, reject) {
                odkData.query(util.deliveryTable, 'beneficiary_entity_id = ? AND authorization_id = ?', [code, activeAuthorization.getRowId(0)],  null, null,
                    null, null, null, null, true, resolve, reject);
            });
        } else if (activeAuthorization.getCount() === 0) {
            $('#search_results').text('There currently are no active authorizations');
            return Promise.reject('There currently are no active authorizations');
        } else {
            //this should never happen
            $('#search_results').text('Internal Error: please contact adminstrator');
            return Promise.reject('Internal Error: please contact adminstrator');
        }
    }).then( function(result) {
        console.log(result);
        if (result != null) {
            if (result.getCount() === 0) {
                // TODO: figure out best way to associate delivery form with token authorization
                dataUtil.triggerTokenDelivery(activeAuthorization.getRowId(0), code, actionTokenDelivery);
            } else {
                $('#search_results').text('This beneficiary entity id has already received the current authorization');
            }
        }
    }).catch( function(reason) {
        console.log(reason);
    });
}

function deliveryFunction() {
    odkData.query(util.beneficiaryEntityTable, 'beneficiary_entity_id = ? and (status = ? or status = ?)', [code, 'ENABLED', 'enabled'], null,
                           null, null, null, null, null, true, deliveryBCheckCBSuccess, deliveryBCheckCBFailure);
}

function deliveryBCheckCBSuccess(result) {
    console.log('deliveryBCheckCBSuccess called');
    if (result.getCount() === 0) {
        odkData.query(util.beneficiaryEntityTable, 'beneficiary_entity_id = ? and (status = ? or status = ?)', [code, 'DISABLED', 'disabled'],
                          null, null, null, null, null, null, true,
                          deliveryDisabledCBSuccess, deliveryDisabledCBFailure);
    } else if (result.getCount() === 1) {
        // double check that this is the case
        odkTables.openDetailWithListView(null, util.getBeneficiaryEntityCustomFormId(), result.getData(0, 'custom_beneficiary_entity_row_id'),
                                             'config/tables/' + util.beneficiaryEntityTable + '/html/' + util.beneficiaryEntityTable + '_detail.html?type=' +
                                             encodeURIComponent(type) + '&rootRowId=' + result.getRowId(0));
    } else {
        odkTables.openTableToListView(
                                      null,
                                      util.beneficiaryEntityTable, 'beneficiary_entity_id = ? and (status = ? or status = ?)', [code,'ENABLED', 'enabled'],
                                      'config/tables/registration/html/beneficiary_entities_list.html?type=' + type);
    }
}

function deliveryBCheckCBFailure(error) {
    console.log('deliveryBCheckCBFailure called with error: ' + error);
}

function deliveryDisabledCBSuccess(result) {
    console.log('disabledCB called');
    if (result.getCount() > 0) {
        $('#search_results').text(odkCommon.localizeText(locale, "disabled_beneficiary_notification"));
    } else {
        $('#search_results').text(odkCommon.localizeText(locale, "missing_beneficiary_notification"));

    }
}

function deliveryDisabledCBFailure(error) {
    console.log('disableCB failed with error: ' + error);
}

function registrationFunction() {
    console.log('registration function path entered');
    if (code === null || code === undefined || code === "") {
        $('#search_results').text(odkCommon.localizeText(locale, "barcode_unavailable"));
    } else {
        odkData.query(util.beneficiaryEntityTable, 'beneficiary_entity_id = ?', [code], null, null,
            null, null, null, null, true, registrationBCheckCBSuccess,
            registrationBCheckCBFailure);
    }
}

function registrationBCheckCBSuccess(result) {
    console.log('registrationBCheckCBSuccess called with value' + result);
    if (result.getCount() === 0) {
            odkData.query(util.entitlementTable, 'beneficiary_entity_id = ?', [code], null, null,
                          null, null, null, null, true, registrationVoucherCBSuccess,
                          registrationVoucherCBFailure);
    } else {
        $('#search_results').text(odkCommon.localizeText(locale, "barcode_unavailable"));
        odkTables.openDetailWithListView(null, util.getBeneficiaryEntityCustomFormId(), result.getData(0, 'custom_beneficiary_entity_row_id'),
            'config/tables/' + util.beneficiaryEntityTable + '/html/' + util.beneficiaryEntityTable + '_detail.html?type=' +
            encodeURIComponent(type) + '&rootRowId=' + result.getRowId(0));

    }
}

function registrationBCheckCBFailure(error) {
    console.log('registrationBCheckCBFailure called with error: ' + error);
}

function registrationVoucherCBSuccess(result) {

    //TODO: if in VOUCHER WORKFLOW_MODE we do not force them to register the beneficiary_entity_id before delivering
    // in REGISTRATION_REQUIRED we would force them to

    var voucherResultSet = result;
    if (voucherResultSet.getCount() === 0) {
        $('#search_results').text(odkCommon.localizeText(locale, "barcode_available"));
    } else {
        $('#search_results').text(odkCommon.localizeText(locale, "voucher_detected"));
    }
    setTimeout(function() {
        var defaultGroup = odkCommon.getSessionVariable(defaultGroupKey);
        var user = odkCommon.getSessionVariable(userKey);

        // TODO: verify that custom beneficiary entity table exists
        var customBEForm = util.getBeneficiaryEntityCustomFormId();
        if (customBEForm == undefined || customBEForm == null || customBEForm == "") {
            // should we provide a ui to register without survey?
            $('#search_results').text("Beneficiary Entity Form not defined");
        }
        var customRowId = util.genUUID();
        var rootRowId = util.genUUID();
        new Promise( function(resolve, reject) {
            var struct = {};
            struct['beneficiary_entity_id'] = code;
            struct['custom_beneficiary_entity_form_id'] = customBEForm;
            struct['custom_beneficiary_entity_row_id'] = customRowId;
            struct['status'] = 'ENABLED';
            struct['status_reason'] = 'standard';
            struct['_group_modify'] = defaultGroup;
            struct['_default_access'] = 'HIDDEN';
            struct['_row_owner'] = user;
            odkData.addRow(util.beneficiaryEntityTable, struct, rootRowId, resolve, reject);
        }).then( function(result) {
            var customDispatchStruct = {};
            var additionalFormsTupleArr = [];

            var additionalFormTuple = {[util.additionalCustomFormsObj.formIdKey] : util.getIndividualCustomFormId(), [util.additionalCustomFormsObj.foreignReferenceKey] : 'custom_beneficiary_entity_row_id', [util.additionalCustomFormsObj.valueKey] : customRowId};
            additionalFormsTupleArr.push(additionalFormTuple);

            customDispatchStruct[util.additionalCustomFormsObj.dispatchKey] = additionalFormsTupleArr;

            console.log(customDispatchStruct);

            dataUtil.createCustomRowFromBaseEntry(result, 'custom_beneficiary_entity_form_id', 'custom_beneficiary_entity_row_id', actionRegistration, customDispatchStruct);
        });
    }, 1000);
}

function registrationVoucherCBFailure(error) {
    console.log('registrationVoucherCBFailure called with error: ' + error);
}

function regOverrideFunction() {
    console.log('entered regoverride path');

    if (code !== "" && code !== undefined && code !== null) {
        var queryCaseType;
        var queriedType;
        if (type === 'enable') {
            queriedType = 'DISABLED';
            queryCaseType = 'disabled';
        } else {
            queriedType = 'ENABLED';
            queryCaseType = 'enabled';
        }
        odkData.query(util.beneficiaryEntityTable, 'beneficiary_entity_id = ? and (status = ? or status = ?)', [code, queriedType, queryCaseType],
                      null, null, null, null, null, null, true,
                      regOverrideBenSuccess, regOverrideBenFailure);
    }
}

function regOverrideBenSuccess(result) {
    if (result.getCount() === 1) {
        odkTables.openDetailView(null, util.getBeneficiaryEntityCustomFormId(), result.getData(0, 'custom_beneficiary_entity_row_id'),
            'config/tables/' + util.beneficiaryEntityTable + '/html/' + util.beneficiaryEntityTable + '_detail.html?type=' +
            encodeURIComponent(type) + '&rootRowId=' + result.getRowId(0));
    } else if (result.getCount() > 1) {
        var queriedType;
        var queryCaseType;
        if (type === 'enable') {
            queriedType = 'DISABLED';
            queryCaseType = 'disabled';
        } else {
            queriedType = 'ENABLED';
            queryCaseType = 'enabled';
        }
        odkTables.openTableToListView(null, util.beneficiaryEntityTable,
                                      'beneficiary_entity_id = ? and (status = ? or status = ?)',
                                      [code, queriedType, queryCaseType],
                                      'config/tables/' + util.beneficiaryEntityTable + '/html/' + util.beneficiaryEntityTable + '_list.html?type=' +
                                      encodeURIComponent(type));
    } else {
        if (type === 'enable') {
            $('#search_results').text(odkCommon.localizeText(locale, "no_disabled_beneficiary"));
        } else {
            $('#search_results').text(odkCommon.localizeText(locale, "no_enabled_beneficiary"));
        }
    }
}

function regOverrideBenFailure(error) {
    console.log('regOverrideFailure with error : ' + error)
}


function entOverrideFunction() {
    if (code !== "" && code !== undefined && code !== null) {
        $('#search_results').text('');
        odkData.query(util.beneficiaryEntityTable, 'beneficiary_entity_id = ?',
                      [code],
                      null, null, null, null, null, null, true, benEntOverrideCBSuccess,
                      benEntOverrideCBFailure);
    } else {
        $('#search_results').text(odkCommon.localizeText(locale, "enter_beneficiary_code"));
    }
}

function benEntOverrideCBSuccess(result) {
    if (result.getCount() != 0) {
        var entDefaultGroup = result.getData(0, '_group_modify');
        odkCommon.setSessionVariable(entDefaultGroupKey, entDefaultGroup);
        odkData.query(util.authorizationTable, '_id = ?',
                      [util.getQueryParameter('authorization_id')], null, null, null, null, null,
                      null, true, restrictOverridesCheckSuccess, restrictOverridesCheckFailure);
    } else {
        $('#search_results').text(odkCommon.localizeText(locale, "missing_beneficiary_notification"));
    }
}

function benEntOverrideCBFailure(error) {
    console.log('failed with error: ' + error);
}

function restrictOverridesCheckSuccess(result) {
    var overrideRestriction = result.getData(0, 'restrict_overrides');
    console.log(overrideRestriction.toUpperCase());
    if (overrideRestriction.toUpperCase() == 'TRUE') {
        odkData.query(util.entitlementTable, 'beneficiary_entity_id = ? and authorization_id = ?',
                      [code, util.getQueryParameter('authorization_id')], null, null, null, null, null,
                      null, true, entCheckCBSuccess, entCheckCBFailure);
    } else {
        createOverrideCBSuccess(result);
    }
}

function restrictOverridesCheckFailure(error) {
    console.log('restrict override failure with error: ' + error);
}

function entCheckCBSuccess(result) {
    if (result.getCount() === 0) {
        odkData.query(util.authorizationTable, '_id = ?',
                      [util.getQueryParameter('authorization_id')],
                      null, null, null, null, null, null, true, createOverrideCBSuccess,
                      createOverrideCBFailure);
    } else {
        $('#search_results').text(odkCommon.localizeText(locale, "already_qualifies_override"));
    }
}

function entCheckCBFailure(error) {
    console.log('scanCBFailure with error:' + error);
}

function createOverrideCBSuccess(result) {
    var defaultGroup = odkCommon.getSessionVariable(entDefaultGroupKey);
    var user = odkCommon.getSessionVariable(userKey)

    var struct = {};

//TODO: would individual ID be set here? is that a separate path? (post MVP)

    struct['authorization_id'] = result.get('_id');
    struct['authorization_name'] = result.get('name');
    struct['authorization_description'] = result.get('description');
    struct['authorization_type'] = result.get('type');
    struct['item_pack_id'] = result.get('item_pack_id');
    struct['item_pack_name'] = result.get('item_pack_name');
    struct['item_description'] = result.get('item_description');
    struct['beneficiary_entity_id'] = code;
    struct['is_override'] = 'TRUE';
    struct['status'] = 'ENABLED';
    //struct['date_created'] = TODO: decide on date format
    struct['_default_access'] = 'HIDDEN';
    struct['_row_owner'] = user;
    struct['_group_modify'] = defaultGroup;
    odkData.addRow(util.entitlementTable, struct, util.genUUID(), addDistCBSuccess, addDistCBFailure);
}

function createOverrideCBFailure(error) {
    console.log('createOverride failed with error: ' + error);
}

var addDistCBSuccess = function(result) {
    $('#search_results').text(odkCommon.localizeText(locale, "override_creation_success"));
};

var addDistCBFailure = function(error) {
    console.log('addDistCBFailure: ' + error);
};