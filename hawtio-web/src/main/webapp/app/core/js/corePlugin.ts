/**
 * The main entry point for hawtio
 *
 * @module Core
 * @main Core
 */
module Core {

  /**
   * Returns true if we are running inside a Chrome app or extension
   */
  export function isChromeApp() {
    var answer = false;
    try {
      answer = (chrome && chrome.app && chrome.extension) ? true : false;
    } catch (e) {
      answer = false;
    }
    //log.info("isChromeApp is: " + answer);
    return answer;
  }


  /**
   * Name of plugin registered to hawtio's plugin loader and Angularjs module name
   *
   * @property pluginName
   * @for Core
   * @type String
   */
  export var pluginName = 'hawtioCore';

  export var templatePath = 'app/core/html/';

}


// Add any other known possible jolokia URLs here
var jolokiaUrls:string[] = [
  url("jolokia"),    // instance configured by hawtio-web war file
  "/jolokia"         // instance that's already installed in a karaf container for example
];

var jolokiaUrl = getJolokiaUrl();
console.log("jolokiaUrl " + jolokiaUrl);

function getJolokiaUrl() {
  var query = hawtioPluginLoader.parseQueryString();
  var localMode = query['localMode'];
  if (localMode) {
    console.log("local mode so not using jolokia URL");
    jolokiaUrls = [];
    return null;
  }
  var uri = query['url'];
  if (angular.isArray(uri)) {
    uri = uri[0];
  }
  return uri ? decodeURIComponent(uri) : null;
}

if (!jolokiaUrl) {
  jolokiaUrl = <string>jolokiaUrls.find(function (url) {
    var jqxhr = $.ajax(url, {
      async: false,
      username: 'public',
      password: 'biscuit'
    });
    return jqxhr.status === 200 || jqxhr.status === 401 || jqxhr.status === 403;
  });
}

// bootstrap plugin loader
hawtioPluginLoader.addUrl(url("/plugin"));

if (jolokiaUrl) {
  // TODO replace with a jolokia call so we use authentication headers
  //hawtioPluginLoader.addUrl("jolokia:" + jolokiaUrl + ":hawtio:type=plugin,name=*");
}

/*
interface IMyAppScope extends ng.IRootScopeService, ng.IScope {
  lineCount: (value:any) => number;
  params: ng.IRouteParamsService;
  is: (type:any, value:any) => boolean;
  empty: (value:any) => boolean;
  log: (variable:string) => void;
  alert: (text:string) => void;
}
*/

hawtioPluginLoader.addModule(Core.pluginName);

var hawtioCoreModule = angular.module(Core.pluginName, ['bootstrap', 'ngResource', 'ui', 'ui.bootstrap.dialog', 'hawtio-ui']).
        config(($routeProvider, $dialogProvider) => {

          $dialogProvider.options({
            backdropFade: true,
            dialogFade: true
          });

          $routeProvider.
                  when('/login', {templateUrl: Core.templatePath + 'login.html'}).
                  when('/welcome', {templateUrl: Core.templatePath + 'welcome.html'}).
                  when('/preferences', {templateUrl: Core.templatePath + 'preferences.html'}).
                  when('/about', {templateUrl: Core.templatePath + 'about.html'}).
                  when('/help', {
                    redirectTo: '/help/index'
                  }).
                  when('/help/:topic/', {templateUrl: Core.templatePath + 'help.html'}).
                  when('/help/:topic/:subtopic', {templateUrl: Core.templatePath + 'help.html'}).

                  otherwise({redirectTo: '/perspective/defaultPage'});
        }).
        constant('layoutTree', Core.templatePath + 'layoutTree.html').
        constant('layoutFull', Core.templatePath + 'layoutFull.html').
        service('localStorage',function () {
          // TODO Create correct implementation of windowLocalStorage
          var storage:WindowLocalStorage = window.localStorage || <any> (function () {
            return {};
          })();
          return storage;
        }).

        factory('pageTitle', function () {
          var answer = new Core.PageTitle();
          return answer;
        }).

        factory('viewRegistry',function () {
          return {};
        }).

        factory('lastLocation', function () {
          return {};
        }).

        factory('helpRegistry', function($rootScope) {
          return new Core.HelpRegistry($rootScope);
        }).

        factory('jolokiaUrl', function() {
          return jolokiaUrl;
        }).

        factory('jolokiaStatus', function() {
          return {
            xhr: null
          };
        }).
        factory('jolokiaParams', function(jolokiaUrl) {
          return {
            url: jolokiaUrl,
            canonicalNaming: false,
            ignoreErrors: true,
            mimeType: 'application/json'
          };
        }).

        factory('branding', function() {
          return {
            appName: 'hawtio',
            appLogo: 'img/logo-16px.png',
            loginBg: 'img/fire.jpg',
            fullscreenLogin: false
          }

        }).

        factory('userDetails', function(jolokiaUrl, localStorage) {
          var answer = angular.fromJson(localStorage[jolokiaUrl]);
          if (!angular.isDefined(answer) && jolokiaUrl) {
            answer = {
              username: '',
              password: ''
            };

            Core.log.debug("No username set, checking if we have a session");
            // fetch the username if we've already got a session at the server
            var userUrl = jolokiaUrl.replace("jolokia", "user");
            $.ajax(userUrl, {
              type: "GET",
              success: (response) => {
                Core.log.debug("Got user response: ", response);
                /*
                // We'll only touch these if they're not set
                if (response !== '' && response !== null) {
                  answer.username = response;
                  if (!('loginDetails' in answer)) {
                    answer['loginDetails'] = {};
                  }
                }
                */
              },
              error: (xhr, textStatus, error) => {
                Core.log.debug("Failed to get session username: ", error);
                // silently ignore, we could be using the proxy
              }
            });

            return answer;

          } else {
            return answer;
          }

        }).

        factory('jolokia',($location:ng.ILocationService, localStorage, jolokiaStatus, $rootScope, userDetails, jolokiaParams) => {
          // TODO - Maybe have separate URLs or even jolokia instances for loading plugins vs. application stuff
          // var jolokiaUrl = $location.search()['url'] || url("/jolokia");
          console.log("Jolokia URL is " + jolokiaUrl);
          if (jolokiaUrl) {

            var credentials = hawtioPluginLoader.getCredentials(jolokiaUrl);
            // pass basic auth credentials down to jolokia if set
            var username = null;
            var password = null;

            //var userDetails = angular.fromJson(localStorage[jolokiaUrl]);

            if (credentials.length === 2) {
              username = credentials[0];
              password = credentials[1];

              // TODO we should try avoid both permutations of username / userName :)

            } else if (angular.isDefined(userDetails) &&
                       angular.isDefined(userDetails.username) &&
                       angular.isDefined(userDetails.password)) {

              username = userDetails.username;
              password = userDetails.password;

            } else if (angular.isDefined(userDetails) &&
                       angular.isDefined(userDetails.userName) &&
                       angular.isDefined(userDetails.password)) {

              username = userDetails.userName;
              password = userDetails.password;

            } else {
              // lets see if they are passed in via request parameter...
              var search = hawtioPluginLoader.parseQueryString();
              username = search["_user"];
              password = search["_pwd"];
              if (angular.isArray(username)) username = username[0];
              if (angular.isArray(password)) password = password[0];
            }

            if (username && password) {

              /*
              TODO can't use this, sets the username/password in the URL on every request, plus jolokia passes them on to $.ajax() which causes a fatal exception in firefox
              jolokiaParams['username'] = username;
              jolokiaParams['password'] = password;
              */

              //console.log("Using user / pwd " + username + " / " + password);

              userDetails.username = username;
              userDetails.password = password;

              $.ajaxSetup({
                beforeSend: (xhr) => {
                  xhr.setRequestHeader('Authorization', Core.getBasicAuthHeader(userDetails.username, userDetails.password));
                }
              });

              var loginUrl = jolokiaUrl.replace("jolokia", "auth/login/");
              $.ajax(loginUrl, {
                type: "POST",
                success: (response) => {
                  if (response['credentials'] || response['principals']) {
                    userDetails.loginDetails = {
                      'credentials': response['credentials'],
                      'principals': response['principals']
                    };
                  } else {
                    var doc = Core.pathGet(response, ['children', 0, 'innerHTML']);
                      // hmm, maybe we got an XML document, let's log it just in case...
                      if (doc) {
                        Core.log.debug("Response is a document (ignoring this): ", doc);
                      }
                  }
                },
                error: (xhr, textStatus, error) => {
                  // silently ignore, we could be using the proxy
                }
              });

            }

            jolokiaParams['ajaxError'] = (xhr, textStatus, error) => {
              if (xhr.status === 401 || xhr.status === 403) {
                userDetails.username = null;
                userDetails.password = null;
              } else {
                jolokiaStatus.xhr = xhr;
                if (!xhr.responseText && error) {
                  xhr.responseText = error.stack;
                }
              }
              Core.$apply($rootScope);
            };

            var jolokia = new Jolokia(jolokiaParams);
            localStorage['url'] = jolokiaUrl;
            jolokia.stop();
            return jolokia;
          } else {
            // empty jolokia that returns nothing
            return {
              request: () => null,
              register: () => null,
              list: () => null,
              search: () => null,
              read: () => null,
              execute: () => null,

              start: () => {
                this.running = true;
                return null;
              },
              stop: () => {
                this.running = false;
                return null;
              },
              isRunning: () => this.running,
              jobs: () => []
            };
          }
        }).
        factory('toastr', () => {
          var win: any = window;
          var answer: any = win.toastr;
          if (!answer) {
            // lets avoid any NPEs
            answer = {};
            win.toaster = answer;
          }
          return answer;
        }).
        factory('xml2json', ($window) => {
          var jquery:any = $;
          return jquery.xml2json;
        }).
        factory('workspace',($location:ng.ILocationService, jmxTreeLazyLoadRegistry, $compile:ng.ICompileService, $templateCache:ng.ITemplateCacheService, localStorage:WindowLocalStorage, jolokia, jolokiaStatus, $rootScope, userDetails) => {
          var answer = new Workspace(jolokia, jolokiaStatus, jmxTreeLazyLoadRegistry, $location, $compile, $templateCache, localStorage, $rootScope, userDetails);
          answer.loadTree();
          return answer;
        }).

        filter("valueToHtml", () => Core.valueToHtml).
        filter('humanize', () => humanizeValue).
        filter('humanizeMs', () => Core.humanizeMilliseconds).

        // autofill directive handles autofill input fields generating proper events in anguarjs
        // see: http://stackoverflow.com/questions/14965968/angularjs-browser-autofill-workaround-by-using-a-directive/16800988#16800988
        directive('autofill', ['$timeout', function ($timeout) {
          return {
            restrict: "A",
            require: 'ngModel',
            link: function (scope, elem, attrs, ctrl) {
              var ngModel = attrs["ngModel"];
              if (ngModel) {
                var log:Logging.Logger = Logger.get("Core");

                function checkForDifference() {
                  // lets compare the current DOM node value with the model
                  // in case we can default it ourselves
                  var modelValue = scope.$eval(ngModel);
                  var value = elem.val();
                  if (value && !modelValue) {
                    Core.pathSet(scope, ngModel, value);
                    //log.info("autofill: Updated ngModel: " + ngModel + " original model value: " + modelValue + " UI value: " + value + " new value: " + scope.$eval(ngModel));
                  } else {
                    //log.info("Got invoked with ngModel: " + ngModel + " modelValue: " + modelValue + " value: " + value);

                    // lets try trigger input/change events just in case
                    // try both approaches just in case one doesn't work ;)
                    elem.trigger('input');
                    elem.trigger('change');
                    if (elem.length) {
                      var firstElem = $(elem[0]);
                      firstElem.trigger('input');
                      firstElem.trigger('change');
                    }
                  }
                }

                $timeout(checkForDifference, 200);
                $timeout(checkForDifference, 800);
                $timeout(checkForDifference, 1500);
              }
            }
          }
        }]).


        run(($rootScope, $routeParams, jolokia, workspace, localStorage, viewRegistry, layoutFull, helpRegistry, pageTitle:Core.PageTitle, branding, toastr, userDetails) => {

          $.support.cors = true;

          /*
           * Count the number of lines in the given text
           */
          $rootScope.lineCount = lineCount;

          /*
           * Easy access to route params
           */
          $rootScope.params = $routeParams;

          /*
           * Wrapper for angular.isArray, isObject, etc checks for use in the view
           *
           * @param type {string} the name of the check (casing sensitive)
           * @param value {string} value to check
           */
          $rootScope.is = function (type:any, value:any):boolean {
            return angular['is' + type](value);
          };

          /*
           * Wrapper for $.isEmptyObject()
           *
           * @param value  {mixed} Value to be tested
           * @return booleanean
           */
          $rootScope.empty = function (value:any):boolean {
            return $.isEmptyObject(value);
          };

          /*
           * Initialize jolokia polling and add handler to change poll
           * frequency
           */
          $rootScope.$on('UpdateRate', (event, rate) => {
            jolokia.stop();
            if (rate > 0) {
              jolokia.start(rate);
            }
            Core.log.debug("Set update rate to: ", rate);
          });

          $rootScope.$emit('UpdateRate', localStorage['updateRate']);

          /*
           * Debugging Tools
           *
           * Allows you to execute debug functions from the view
           */
            // TODO Doesn't support vargs like it should
          $rootScope.log = function (variable:any):void {
            console.log(variable);
          };
          $rootScope.alert = function (text:string) {
            alert(text);
          };

          viewRegistry['fullscreen'] = layoutFull;
          viewRegistry['notree'] = layoutFull;
          viewRegistry['help'] = layoutFull;
          viewRegistry['welcome'] = layoutFull;
          viewRegistry['preferences'] = layoutFull;
          viewRegistry['about'] = layoutFull;
          viewRegistry['login'] = layoutFull;

          helpRegistry.addUserDoc('index', 'app/core/doc/overview.md');
          helpRegistry.addUserDoc('preference', 'app/core/doc/preference.md');
          helpRegistry.addSubTopic('index', 'faq', 'app/core/doc/FAQ.md');
          helpRegistry.addSubTopic('index', 'changes', 'app/core/doc/CHANGES.md');
          helpRegistry.addSubTopic('index', 'developer', 'app/core/doc/developer.md');
          helpRegistry.addDevDoc('Core', 'app/core/doc/coreDeveloper.md');
          helpRegistry.addDevDoc('ui1', 'app/ui/doc/developerPage1.md');
          helpRegistry.addDevDoc('ui2', 'app/ui/doc/developerPage2.md');
          helpRegistry.addDevDoc('datatable', 'app/datatable/doc/developer.md');
          helpRegistry.addDevDoc('Force Graph', 'app/forcegraph/doc/developer.md');

          //helpRegistry.discoverHelpFiles(hawtioPluginLoader.getModules());

          var opts = localStorage['CodeMirrorOptions'];
          if (opts) {
            opts = angular.fromJson(opts);
            CodeEditor.GlobalCodeMirrorOptions = angular.extend(CodeEditor.GlobalCodeMirrorOptions, opts);
          }


          toastr.options = {
            'closeButton': true,
            'showMethod': 'slideDown',
            'hideMethod': 'slideUp'
          };


          window['logInterceptors'].push((level, message) => {
              if (level === "WARN") {
                notification('warning', message);
              }
              if (level === "ERROR") {
                notification('error', message);
              }

          });

          setTimeout(() => {
            $("#main-body").fadeIn(2000).after(() => {
              Core.log.info(branding.appName + " started");
              Core.$apply($rootScope);
              $(window).trigger('resize');
            });
          }, 500);

        }).
        directive('noClick', () => {
          return function($scope, $element, $attrs) {
            $element.click((event) => {
              event.preventDefault();
            });
          }
        }).
        directive('gridStyle', function($window) {
          return new Core.GridStyle($window);
        }).
        directive('logToggler', function(localStorage) {
          return {
            restrict: 'A',
            link: ($scope, $element, $attr) => {
              $element.click(() => {
                var log = $("#log-panel");
                var body = $('body');
                if (log.height() !== 0) {
                  localStorage['showLog'] = 'false';
                  log.css({'bottom': '110%'});
                  body.css({
                    'overflow-y': 'auto'
                    });
                } else {
                  localStorage['showLog'] = 'true';
                  log.css({'bottom': '50%'});
                  body.css({
                    'overflow-y': 'hidden'
                    });
                }
                return false;
              });
            }
          };

        }).directive('hawtioFileUpload', () => {
  return new Core.FileUpload();
        })
  ;

// for chrome packaged apps lets enable chrome-extension pages
if (hawtioCoreModule && Core.isChromeApp()) {
  hawtioCoreModule.config([
    '$compileProvider',
    function ($compileProvider) {
      //$compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|chrome-extension):/);
      $compileProvider.urlSanitizationWhitelist(/^\s*(https?|ftp|mailto|chrome-extension):/);
      // Angular before v1.2 uses $compileProvider.urlSanitizationWhitelist(...)
    }
  ]);
}


// enable bootstrap tooltips
$(function () {
  $("a[title]").tooltip({
    selector: '',
    delay: { show: 1000, hide: 100 }
  });
});

var adjustHeight = function () {
  var windowHeight = $(window).height();
  var headerHeight = $("#main-nav").height();
  var containerHeight = windowHeight - headerHeight;
  $("#main").css("min-height", "" + containerHeight + "px");
};

$(function () {
  hawtioPluginLoader.loadPlugins(function () {
    var doc = $(document);
    angular.bootstrap(doc, hawtioPluginLoader.getModules());
    $(document.documentElement).attr('xmlns:ng', "http://angularjs.org");
    $(document.documentElement).attr('ng-app', 'hawtioCore');
    adjustHeight();
    $(window).resize(adjustHeight);
  });
});


