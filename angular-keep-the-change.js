(function(){ 'use strict';

angular.module('KeepTheChange', [])

.factory('KeepTheChange', [ 'LocalStorage', function(LocalStorage){

  var
    ignoreDefault     = [ '$promise', '$resolved' ],
    modifiersDefault  = [ 'o+ ', 'o- ', 'a+ ', 'a- ' ],
    isEmpty = function(obj) {
      for(var key in obj) {
        if(obj.hasOwnProperty(key)) return false;
      }
    return true;
    };


  var KeepTheChange = function(model, scope, master, expression, id){

    this.model      = model;
    this.scope      = scope;
    this.master     = master || this.scope['master'];
    this.expression = expression || (model.charAt(0).toLowerCase() + model.substr(1));
    this.id         = id ? id : false;


    this.ignore     = [].concat(ignoreDefault);
    this.modifiers  = angular.copy(modifiersDefault);
    this.copy       = {};

    this.dirty        = undefined;
    this._onDirties   = [];
    this._onPristines = [];

    if ( this.master && this.model && this.scope ) {
      this.init();
    }

  };

  KeepTheChange.prototype.init = function(){
    var that = this;

    if ( this.master.$promise && this.master.$promise.then ) {
      this.master.$promise.then(function(){
        that._init();
      });
    } else {
      this._init();
    }
  };

  KeepTheChange.prototype._init = function() {
    var that = this;

    this.id   = this.id || this.master._id;

    //Object.setPrototypeOf( this.copy, Object.getPrototypeOf(this.master) ); /* harmony proposal */

    this.copy.__proto__ = this.master.constructor.prototype;
    this.extendResource();
    this.assimilate();

    this.applyDelta();

    if ( !this.scope[this.expression] ) {
      this.scope[this.expression] = this.copy;
    }

    if ( 'undefined' === typeof this.scope.reset ) {
      this.scope.reset = function(){
        that.reset();
      };
    }

    this.watcher = this.scope.$watch(this.expression, function(){ that.watch(); }, true);
  };

  KeepTheChange.prototype.extendResource = function(){
    var
      that    = this,
      save    = this.copy.__proto__.$save,
      remove  = this.copy.__proto__.$remove;

    this.copy.__proto__.$save = function(){
      var result = save.apply(that.copy, arguments);

      result.then(function(){
        that.removeStored();
      });

      return result;
    };

    this.copy.__proto__.$remove = this.copy.__proto__.$delete = function(){
      var result = remove.apply(that.copy, arguments);

      result.then(function(){
        that.removeStored();
      });

      return result;
    };
  };

  KeepTheChange.prototype.onDirty = function(fnx){
    this._onDirties.push(fnx);
    if ( 'object' === typeof this.dirty ) {
      fnx(this.dirty);
    }
  };

  KeepTheChange.prototype._onDirty = function(){
    for (var i = 0; i < this._onDirties.length; i++) {
      this._onDirties[i](this.dirty);
    }
  };

  KeepTheChange.prototype.onPristine = function(fnx){
    this._onPristines.push(fnx);
    if ( false === this.dirty) {
      fnx(!this.dirty);
    }
  };

  KeepTheChange.prototype._onPristine = function(){
    for (var i = 0; i < this._onPristines.length; i++) {
      this._onPristines[i](!this.dirty);
    }
  };


  KeepTheChange.prototype._path = function(){
    return this.model +'.'+ this.id;
  };

  KeepTheChange.prototype.reset = function(){
    this.assimilate();
    this.removeStored();
  };

  KeepTheChange.prototype.store = function(value){
    LocalStorage.set(this._path(), value);
  };
  KeepTheChange.prototype.getStored = function(){
    return LocalStorage.get(this._path());
  };
  KeepTheChange.prototype.removeStored = function(){
    LocalStorage.remove(this._path());
  };

  KeepTheChange.prototype.assimilate = function(dst, src) {
    var key;

    if ( 'undefined' === typeof dst ) {
      dst = this.copy;
      src = this.master;
    }

    for (key in src) {
      if ( src.hasOwnProperty(key) && ('object' === typeof src[key]) ) {
        if ( angular.isArray(src[key]) ) {
          dst[key] = dst[key] || [];
        } else {
          dst[key] = dst[key] || {};
        }
        this.assimilate(dst[key], src[key]);
      } else {
        dst[key] = src[key];
      }
    }

    for (key in dst) {
      if ( dst.hasOwnProperty(key) && !src.hasOwnProperty(key) ) {
        if ( angular.isArray(dst) ) {
          dst.splice(key, 1);
        } else {
          delete dst[key];
        }
      }
    }



    return dst;
  };

  KeepTheChange.prototype.watch = function() {
    var delta = this.delta( this.master, this.copy );
    // if ( Object.getOwnPropertyNames(delta).length === 0 ) { /* ecma 1.8.5+ only :( */
    if ( isEmpty(delta) ) {
      this.removeStored();
      this._onPristine();
    } else {
      this.store(delta);
      this._onDirty();
    }
  };

  KeepTheChange.prototype.applyDelta = function(delta){
    delta = delta || this.getStored();

    if (!delta) {
      this.dirty = false;
      return;
    }

    var
      paths = {},
      key, modifier, path;

    for (key in delta) {
      modifier = this.modifiers.indexOf(key.substr(0,this.modifiers[0].length));
      path = key;
      if ( -1 !== modifier ) {
        path = key.substr(this.modifiers[0].length);
      }
      this.patch(path, delta[key], modifier);
      paths[path] = this.modifiers[modifier];
    }

    this.dirty = paths;
    this._onDirty();
  };

  KeepTheChange.prototype.patch = function(path, value, modifier){
    var
      traverse  = path.split('.'),
      length    = traverse.length,
      reference = this.copy,
      i;

    for (i = 0; i < length; i++) {
      if ( i === length -1 ) {
        switch(modifier) {
          case 1:
            delete reference[traverse[i]];
            break;
          case 3:
            reference.splice(traverse[i], 1); // crossbrowser cast to int from str? or use ~~ ...
            break;
          default:
            reference[traverse[i]] = value;
            break;
        }
      } else {
        if ( !reference.hasOwnProperty(traverse[i]) ) {
          if ( (i === length -2) && (modifier === 2) ) {
            reference[traverse[i]] = [];
          } else {
            reference[traverse[i]] = {};
          }
        }
        reference = reference[traverse[i]];
      }
    }
  };

  KeepTheChange.prototype.delta = function(o1, o2, path){
    var
      delta = {},
      key;

    path = path ? path : '';

    for(key in o1){
      if ( o1.hasOwnProperty(key) && (this.ignore.indexOf(path + key) === -1) ){

        if ( o2.hasOwnProperty(key) ) {
          switch(typeof o1[key]) {
            case 'object':


              angular.extend(delta, this.delta( o1[key], o2[key], path + key +'.' ));
              break;
            case 'number':
            case 'string':
              if ( o1[key] != o2[key] ) {
                delta[path + key] = o2[key];
              }
              break;
          }
        } else if ( angular.isArray(o1) ) {
          delta[this.modifiers[3] + path + key] = true;
        } else {
          delta[this.modifiers[1] + path + key] = true;
        }

      }
    }

    for(key in o2){
      if ( o2.hasOwnProperty(key) && (this.ignore.indexOf(path + key) === -1) ) {

        if ( o1.hasOwnProperty(key) ) {
          if ( 'object' === typeof o2[key] ) {
            angular.extend(delta, this.delta( o1[key], o2[key], path + key +'.' ));

          } else if ( o1[key] != o2[key] ) {
            delta[path + key] = o2[key];
          }
        } else if ( angular.isArray(o2) ) {
          delta[this.modifiers[2] + path + key] = o2[key];
        } else if ( 'object' === typeof o2[key] ) {
          angular.extend(delta, this.delta( {}, o2[key], path + key +'.' ));
        } else {
          delta[this.modifiers[0] + path + key] = o2[key];
        }

      }
    }

    return delta;
  };

  return KeepTheChange;
} ]);

})();