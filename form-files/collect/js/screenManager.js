'use strict';
// depends upon -- opendatakit, Backbone, $, Handlebars, jQueryMobile, text (a requirejs plugin).
//
// also depends upon: 'controller' -- to avoid a circular dependency, 'controller' is passed 
// in during initialize() and stored in a member variable.
//
define(['opendatakit','backbone','jquery','handlebars','text!templates/screen.handlebars' ,'jqmobile'], 
function(opendatakit, Backbone, $, Handlebars, screenTemplate) {

return Backbone.View.extend({
    el: "body",
    className: "current",
    instance_id:123,
    template: Handlebars.compile(screenTemplate),
    swipeTimeStamp: -1,
    swipeEnabled: true,//Swipe can be disabled to prevent double swipe bug
    noPreviousPage: function(ctxt) {
        ctxt.append("screenManager.noPreviousPage");
        alert("I've forgotten what the previous page was!");
        ctxt.success();
    },
    noNextPage: function(ctxt) {
        ctxt.append("screenManager.noNextPage");
        alert("No next page!");
        ctxt.success();
    },
    unexpectedError: function(ctxt, action, ex) {
        try {
            alert("Unexpected error: " + action + " Reason: " + ex );
        } catch (e) {
        }
        ctxt.success();
    },
    renderContext:{},
    initialize: function(ctxt){
        this.controller = this.options.controller;
        this.currentPageEl = $('[data-role=page]');
        console.assert(this.currentPageEl.length === 1);
        var that = this;
        /*
        var f = function() {
            requirejs(['text!templates/screen.handlebars'], function(source) {
                    that.template = Handlebars.compile(source);
            }, function(err) {
                if ( err.requireType == "timeout" ) {
                    setTimeout( f, 100);
                }
            });
        };
        f();
        */
    },
    cleanUpScreenManager: function(ctxt){
        this.swipeEnabled = true;
        this.savedCtxt = null;
        this.displayWaiting(ctxt);
    },
    displayWaiting: function(ctxt){
        ctxt.append("screenManager.displayWaiting", (this.prompt == null) ? "promptIdx: null" : ("promptIdx: " + this.prompt.promptIdx));
        var $e;
        $e = $('.current');
        $e.html('<span>Please wait...</span>');
        $e = $('.odk-toolbar');
        $e.html('');
        $e = $('.odk-nav');
        $e.html('');
    },
    setPrompt: function(ctxt, prompt, jqmAttrs){
        if(!jqmAttrs){
            jqmAttrs = {};
        }
        var that = this;
        // TODO: tell existing prompt it is inactive (e.g,. semaphore)...
        if(this.prompt) {
            this.prompt.undelegateEvents();
        }
        this.previousPageEl = this.currentPageEl;
        this.prompt = prompt;
        this.swipeEnabled = false;
        this.renderContext = {
			formTitle: prompt.database.getTableMetaDataValue('formTitle'),
			instanceName: prompt.database.getInstanceMetaDataValue('instanceName'),
            showHeader: true,
            showFooter: false,
            enableForwardNavigation: true,
            enableBackNavigation: true,
            enableNavigation: true
            // enableNavigation -- defaults to true; false to disable everything...
            // enableForwardNavigation -- forward swipe and button
            // enableBackNavigation -- backward swipe and button
            //
            // the absence of page history disabled backward swipe and button.
        };
        var that = this;

        //A better way to do this might be to pass a controller interface object to 
        //onActivate that can trigger screen refreshes, as well as goto other prompts.
        //(We would not allow prompts to access the controller directly).
        //When the prompt changes, we could disconnect the interface to prevent the old
        //prompts from messing with the current screen.
        that.prompt.onActivate($.extend({},ctxt,{
            success:function(renderContext){
                var isFirstPrompt = !('previousPageEl' in that);
                var transition = 'none'; // isFirstPrompt ? 'fade' : 'slide';
                if(renderContext){
                    $.extend(that.renderContext, renderContext);
                }
                if( !that.renderContext.enableBackNavigation &&
                !that.renderContext.enableForwardNavigation ){
                    //If we try to render a jqm nav without buttons we get an error
                    //so this flag automatically disables nav in that case.
                    that.renderContext.enableNavigation = false;
                }
                /*
                console.log(that.renderContext);
                // work through setting the forward/backward enable flags
                if ( that.renderContext.enableNavigation === undefined ) {
                    that.renderContext.enableNavigation = true;
                }
                if ( that.renderContext.enableForwardNavigation === undefined ) {
                    that.renderContext.enableForwardNavigation = 
                        that.renderContext.enableNavigation;
                }
                if ( that.renderContext.enableBackNavigation === undefined ) {
                    that.renderContext.enableBackNavigation = 
                        that.renderContext.enableNavigation &&
                        that.controller.hasPromptHistory(ctxt);
                }
                */
                that.currentPageEl = that.renderPage(prompt);
                that.$el.append(that.currentPageEl);
                // this might double-reset the swipeEnabled flag, but it does ensure it is reset
                that.savedCtxt = $.extend({}, ctxt, {
                    success: function() {
                        that.swipeEnabled = true;
                        ctxt.success();
                    },
                    failure: function() {
                        that.swipeEnabled = true;
                        ctxt.failure();
                    }
                });
                $.mobile.changePage(that.currentPageEl, $.extend({
                    changeHash: false,
                    transition: transition
                }, jqmAttrs));
            }
        }));
    },
    gotoNextScreen: function(evt) {
        var that = this;
        /*
        This debounce is a total hack.
        The bug it is trying to solve is the issue
        where the first page of the survey is skipped. 
        The problem stems from swipe events being registered twice.
        Only the opening prompt has problems because it does some unique things
        in it's beforeMove function.
        */
        var ctxt = that.controller.newContext(evt);
        ctxt.append('screenManager.gotoNextScreen', ((that.prompt != null) ? ("px: " + that.prompt.promptIdx) : "no current prompt"));
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        if (that.swipeTimeStamp == evt.timeStamp) {
            ctxt.append('screenManager.gotoNextScreen.duplicateEvent');
            ctxt.success();
            return false;
        } else if(!that.swipeEnabled) {
            ctxt.append('screenManager.gotoNextScreen.ignoreDisabled');
            ctxt.success();
            return false;
        }
        that.swipeTimeStamp = evt.timeStamp;
        that.swipeEnabled = false;
        that.controller.gotoNextScreen($.extend({},ctxt,{
                success:function(){
                    that.swipeEnabled = true; ctxt.success();
                },failure:function(){
                    that.swipeEnabled = true; ctxt.failure();
                }}));
        return false;
    },
    gotoPreviousScreen: function(evt) {
        var that = this;
        var ctxt = that.controller.newContext(evt);
        ctxt.append('screenManager.gotoPreviousScreen', ((that.prompt != null) ? ("px: " + that.prompt.promptIdx) : "no current prompt"));
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        if (that.swipeTimeStamp == evt.timeStamp) {
            ctxt.append('screenManager.gotoPreviousScreen.duplicateEvent');
            ctxt.success();
            return false;
        } else if(!that.swipeEnabled) {
            ctxt.append('screenManager.gotoPreviousScreen.ignoreDisabled');
            ctxt.success();
            return false;
        }
        that.swipeTimeStamp = evt.timeStamp;
        that.swipeEnabled = false;
        that.controller.gotoPreviousScreen($.extend({},ctxt,{
                success:function(){ 
                    that.swipeEnabled = true; ctxt.success();
                },failure:function(){
                    that.swipeEnabled = true; ctxt.failure();
                }}));
        return false;
    },
    openOptions: function(evt){
        $( "#optionsPopup" ).find('.message').text("Hi.");
        $( "#optionsPopup" ).popup( "open" );
    },
    handlePagechange: function(evt){
        var ctxt = this.savedCtxt;
        this.savedCtxt = null;
        
        if ( ctxt != null ) {
            ctxt.append('screenManager.handlePageChange.linked');
            this.prompt.delegateEvents();
            if(this.previousPageEl){
                var pg = this.previousPageEl;
                this.previousPageEl = null;
                pg.remove();
            }
            ctxt.success();
        } else {
            ctxt = that.controller.newContext(evt);
            ctxt.append('screenManager.handlePageChange.error');
            this.swipeEnabled = true;
            ctxt.failure();
        }
    },
    disableImageDrag: function(evt){
        evt.preventDefault();
    },
    events: {
        "click .odk-next-btn": "gotoNextScreen",
        "click .odk-prev-btn": "gotoPreviousScreen",
        "click .odk-options-btn": "openOptions",
        "swipeleft .swipeForwardEnabled": "gotoNextScreen",
        "swiperight .swipeBackEnabled": "gotoPreviousScreen",
        "pagechange": "handlePagechange",
        "dragstart img": "disableImageDrag"
    },
    renderPage: function(prompt){
        var $page = $('<div>');
        $page.attr('data-role', 'page');
        $page.attr('data-theme', "d");
        $page.attr('data-content-theme', "d");
        if(this.renderContext.enableNavigation){
            if(this.renderContext.enableForwardNavigation){
                $page.addClass('swipeForwardEnabled');
            }
            if(this.renderContext.enableBackNavigation){
                $page.addClass('swipeBackEnabled');
            }
        }
        $page.html(this.template(this.renderContext));
        var $contentArea = $page.find('.odk-container');
        prompt.setElement($contentArea);
        prompt.render();
        prompt.undelegateEvents();
        //$contentArea.append(prompt.$el);
        return $page;
    }
});
});