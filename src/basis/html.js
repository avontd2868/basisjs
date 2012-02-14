/*!
 * Basis javascript library 
 * http://code.google.com/p/basis-js/
 *
 * @copyright
 * Copyright (c) 2006-2012 Roman Dvornov.
 *
 * @license
 * GNU General Public License v2.0 <http://www.gnu.org/licenses/gpl-2.0.html>
 */

basis.require('basis.dom');
basis.require('basis.cssom');
basis.require('basis.dom.event');

!function(basis, global){

  'use strict';

 /**
  * @namespace basis.html
  */

  var namespace = 'basis.html';


  //
  // import names
  //

  var document = global.document;
  var Class = basis.Class;
  var dom = basis.dom;
  var domEvent = basis.dom.event;
  var classList = basis.cssom.classList;


  //
  // Main part
  //

  var tmplEventListeners = {};
  var tmplNodeMap = { seed: 1 };

  var tmplPartFinderRx = /<([a-z0-9\_]+)(?:\{([a-z0-9\_\|]+)\})?([^>]*?)(\/?)>|<\/([a-z0-9\_]+)>|<!--(\s*\{([a-z0-9\_\|]+)\}\s*|.*?)-->/i;
  var tmplAttrRx = /(?:([a-z0-9\_\-]+):)?(event-)?([a-z0-9\_\-]+)(?:\{([a-z0-9\_\|]+)\})?(?:="((?:\\.|[^"])*?)"|='((?:\\.|[^'])*?)')?\s*/gi;
  var classNameRx = /^(.)|\s+/g;
  var domFragment = dom.createFragment();

  //
  // Feature detection tests
  //

  // Test for appendChild bugs (old IE browsers has a problem with some tags like <script> and <style>)
  function appendTest(tagName){
    try {
      return !dom.createElement(tagName, '');
    } catch(e) {
      return true;
    }
  }

  var SCRIPT_APPEND_BUGGY = appendTest('script');
  var STYLE_APPEND_BUGGY = appendTest('style');

  // Test for browser (IE) normalize text nodes during cloning
  var CLONE_NORMALIZE_TEXT_BUG = (function(){
    return dom.createElement('', 'a', 'b').cloneNode(true).childNodes.length == 1;
  })();

  //
  // Helpers
  //
  
  var createFragment = dom.createFragment;
  var createText = dom.createText;
  var createComment = function(value){
    return document.createComment(value);
  };

  function documentFragmentToText(fragment){
    return dom.outerHTML(fragment, true);
  }

  //
  // PARSE TEXT
  //
  function parseText(context, str, nodePath, pos){
    var result = createFragment();

    if (str)
    {
      var parts = str.split(/\{([a-z0-9\_]+(?:\|[^}]*)?)\}/i);
      var text;

      for (var i = 0; i < parts.length; i++)
      {
        text = parts[i];

        if (i & 1)
        {
          for (var j = 0, refs = text.split(/\|/), refName; refName = refs[j]; j++)
            context.getters[refName] = nodePath + 'childNodes[' + pos + ']';
        }

        if (text) // don't add an empty strings
        {
          // Some browsers (Internet Explorer) may normalize text nodes during cloning, that's why 
          // we need to insert comment nodes between text nodes to prevent text node merge
          if (CLONE_NORMALIZE_TEXT_BUG)
          {
            if (result.lastChild)
              result.appendChild(createComment(''));
            pos++;
          }

          result.appendChild(createText(text));
          pos++;
        }
      }
    }

    return result;
  }

  //
  // PARSE ATTRIBUTES
  //
  function createEventHandler(attrName){
    return function(event){
      if (event && event.type == 'click' && event.which == 3)
        return;

      var cursor = domEvent.sender(event);
      var attr;
      var refId;

      // IE events may have no source
      if (!cursor)
        return;

      // search for nearest node with event-{eventName} attribute
      do {
        if (attr = (cursor.getAttributeNode && cursor.getAttributeNode(attrName)))
          break;
      } while (cursor = cursor.parentNode);

      // if not found - exit
      if (!cursor || !attr)
        return;

      // search for nearest node refer to basis.Class instance
      do {
        if (refId = cursor.basisObjectId)
        {
          // if found call templateAction method
          var node = tmplNodeMap[refId];
          if (node && node.templateAction)
          {
            var actions = attr.nodeValue.qw();

            for (var i = 0, actionName; actionName = actions[i++];)
              node.templateAction(actionName, domEvent(event));

            break;
          }
        }
      } while (cursor = cursor.parentNode);
    }
  }

  function parseAttributes(context, str, nodePath, tagName){
    str = str.trim();

    if (!str)
      return { text: '', events: [] };

    var result = '';
    var events = [];
    var m;

    while (m = tmplAttrRx.exec(str))
    {
      //    0      1   2       3     4      5       6
      // m: match, ns, prefix, name, alias, value1, value2

      var prefix = m[2] || '';
      var name = m[3];
      var attrName = prefix + name;
      var value = m[5] || m[6] || name;

      // store reference for attribute
      if (m[4])
        context.getters[m[4]] = nodePath + '.getAttributeNode("' + name + '")';

      // if attribute is event binding, add global event handler
      if (prefix == 'event-')
      {
        if (!tmplEventListeners[name])
        {
          tmplEventListeners[name] = createEventHandler(attrName);

          for (var i = 0, names = domEvent.browserEvents(name), browserEventName; browserEventName = names[i++];)
            domEvent.addGlobalHandler(browserEventName, tmplEventListeners[name]);
        }

        // hack for non-bubble events in IE<=8
        if (!domEvent.W3CSUPPORT)
        {
          var eventInfo = domEvent.getEventInfo(name, tagName);
          if (eventInfo.supported && !eventInfo.bubble)
            events.push(name);
            //result += '[on' + eventName + '="basis.dom.event.fireEvent(document,\'' + eventName + '\')"]';
        }
      }
      /*else
      {
        if (prefix == 'bind-')
        {
          value = String(value || name);

          if (!value.match(/^(([a-z0-9\_\-]*\:)?[a-z0-9\_\-]+)(\|([a-z0-9\_\-]*\:)?[a-z0-9\_\-]+)*$/i))
            throw 'wrong value for binding ' + attrName + ': ' + value;

          var parts = value.split(/\|/);
          for (var i = 0; i < parts.length; i++)
          {
            
          }

          var firstChar = value.charAt(0);
          var binding = [
            'newValue = Boolean(value);\n',
            'if (this.' + name + ' !== newValue)',
            '{',
            '  elementClassList = classList(tmpl' + nodePath.replace(/^\.childNodes\[0\]/, '.element') + ');',
            '  if (this.' + name + ' = newValue)',
            '    elementClassList.add(' + value.quote() + ');',
            '  else',
            '    elementClassList.remove(' + value.quote() + ');',
            '};\n'
          ].join('\n');

          context.bindings[name] = {
            default: false,
            code: binding
          };

          continue;
        }
      }*/

      result += attrName == 'class'
                  ? value.trim().replace(classNameRx, '.$1')
                  : '[' + attrName + (value ? '=' + value.quote('"') : '') + ']';
    }

    return {
      text: result,
      events: events
    };
  }

  //
  // PARSE HTML
  //
  function parseHtml(context, path){
    if (!context.stack)
      context.stack = [];

    if (!context.source)
      context.source = context.str;

    if (!path)
      path = '.';

    var result = createFragment();
    var preText;
    var pos = 0;
    var m;
    var stack = context.stack;

    while (m = tmplPartFinderRx.exec(context.str))
    {
      //    0      1        2      3           4            5         6        7
      // m: match, tagName, alias, attributes, isSingleton, closeTag, comment, commentAlias

      preText = RegExp.leftContext;
      context.str = context.str.substr(preText.length + m[0].length);

      // if something before -> parse text & append result
      if (preText.length)
      {
        result.appendChild(parseText(context, preText, path, pos));
        pos = result.childNodes.length;
      }

      // end tag
      if (m[5])
      {
        // if end tag match to last stack tag -> remove last tag from tag and return
        if (m[5] == stack[stack.length - 1])
        {
          stack.pop();
          return result;
        }
        else
        {
          ;;;if (typeof console != undefined) console.log('Wrong end tag </' + m[5] + '> in Html.Template (ignored)\n\n' + context.source.replace(new RegExp('(</' + m[5] + '>)(' + context.str + ')$'), '\n ==[here]=>$1<== \n$2'));
          throw "Wrong end tag";
        }
      }

      // comment
      if (m[6])
      {
        if (m[7])
          context.getters[m[7]] = path + 'childNodes[' + pos + ']';

        result.appendChild(createComment(m[6]));
      }
      // open tag
      else
      {
        var descr = m[0];
        var tagName = m[1];
        var name = m[2];
        var attributes = m[3];
        var singleton = !!m[4];
        var nodePath = path + 'childNodes[' + pos + ']';
        var attrs = parseAttributes(context, attributes, nodePath, tagName);
        var element = dom.createElement(tagName + attrs.text);

        // hack for non-bubble events in IE<=8
        for (var i = 0, eventName; eventName = attrs.events[i]; i++)
          element.attachEvent('on' + eventName, function(eventName){
            return function(){
              domEvent.fireEvent(document, eventName);
            }
          }(eventName));
          
        if (name)
          context.getters[name] = nodePath;

        if (!singleton)
        {
          stack.push(tagName);

          var elementContent = parseHtml(context, nodePath + '.');
          tagName = element.tagName.toLowerCase();

          if (SCRIPT_APPEND_BUGGY && tagName == 'script')
            element.text = documentFragmentToText(elementContent);
          else
            if (STYLE_APPEND_BUGGY && tagName == 'style')
              element.styleSheet.cssText = documentFragmentToText(elementContent);
            else
              element.appendChild(elementContent);
        }

        result.appendChild(element);
      }

      pos++;
    }
    
    // no tag found, but there can be trailing text -> parse text
    if (context.str.length)
      result.appendChild(parseText(context, context.str, path, pos));

    if (stack.length)
    {
      ;;;if (typeof console != undefined) console.log('No end tag for ' + stack.reverse() + ' in Html.Template:\n\n' + context.source);
      throw "No end tag for " + stack.reverse();
    }

    return result;
  }


 /**
  * Parsing template
  * @func
  */
  function parseTemplate(){
    if (this.proto)
      return;

    var source = this.source;

    if (typeof source == 'function')
      source = source();

    source = source.trim();

    this.source = source;

    var context = {
      str: source,
      getters: {
        element: '.childNodes[0]'
      },
      bindings: {
      }
    };

    // parse html
    var proto = parseHtml(context);

    // build pathes for references
    var body = Object.iterate(context.getters, function(name, getter){
      var names = name.split(/\|/);
      
      // .map(String.format, 'obj_.{0}')
      for (var i = 0; i < names.length; i++)
        names[i] = 'obj_.' + names[i];

      // optimize path (1)
      var path = getter.split(/(\.?childNodes\[(\d+)\])/);
      var cursor = proto;
      for (var i = 0; i < path.length; i += 3)
      {
        var pos = path[i + 2];
        if (!pos)
          break;

        path[i + 2] = '';
        cursor = cursor.childNodes[pos];

        if (!cursor.previousSibling)
          path[i + 1] = '.firstChild';
        else
          if (!cursor.nextSibling)
            path[i + 1] = '.lastChild';
      }

      // return body parts
      return {
        name:  names[0],
        alias: names.join('='),
        path:  'dom_' + path.join('')
      }
    }).sortAsObject('path');

    // optimize pathes (2)
    for (var i = 0, line; line = body[i]; i++)
    {
      var pathRx = new RegExp('^' + line.path.forRegExp());
      for (var j = i + 1, nextBodyPart; nextBodyPart = body[j++];)
        nextBodyPart.path = nextBodyPart.path.replace(pathRx, line.name);
    }

    var createBody = [];
    var clearBody = [];
    for (var i = 0, line; line = body[i]; i++)
    {
      createBody[i] = '\n' + line.alias + '=' + line.path;
      clearBody[i] = line.alias + '=null\n';
    }

    var defaultValues = function(){};
    var hasBindings = false;
    var setCode = '';
    for (var key in context.bindings)
    {
      //console.log(key, context.bindings[key].code);
      defaultValues.prototype[key] = context.bindings[key].default;

      setCode += 'case "' + key + '":\n' + context.bindings[key].code + '\nbreak;\n';

      hasBindings = true;
    }

    /*var setFunction = function(){};
    if (hasBindings)
    {
      setFunction = new Function('classList', 'return ' + 
        function(tmpl, key, value){
          var newValue;
          // specific code start
          _code_(); // <-- will be replaced for specific code
          // specific code end
        }
      .toString().replace('_code_()', 'switch(key){\n' + setCode + '\n}'))(classList);

      console.log(setFunction.toString());
      createBody.push('\nobj_.setValue=setValue_.bind(new defs_, obj_)');
      //createBody.push('\nobj_.setValue=setValue_.bind(new defs_, obj_)');
      //createBody.push('\nobj_.sync=sync.bind(new defs_, obj_)');
      console.log(createBody);
    }
    else
    {
      createBody.push('\nobj_.setValue=setValue_');
    }*/

    //
    // build createInstance function
    //
    this.createInstance = new Function('proto_', 'map_', 'setValue_', 'defs_', 'var obj_, dom_; return ' + 
      // mark variable names with dangling _ to avoid renaming by compiler, because
      // this names using by generated code, and must be unchanged

      // WARN: don't use global scope variables, resulting function has isolated scope

      function(object, node){
        obj_ = object || {};
        dom_ = proto_.cloneNode(true);

        // specific code start
        _code_(); // <-- will be replaced for specific code
        // specific code end

        if (node)
        {
          var id = obj_.element.basisObjectId = map_.seed++;
          map_[id] = node;
        }

        return obj_;
      }

    .toString().replace('_code_()', createBody))(proto, tmplNodeMap/*, setFunction, defaultValues*/); // body.map(String.format, '{alias}={path};\n').join('')

    /*if (hasBindings)
      console.log(this.createInstance.toString())*/

    //
    // build clearInstance function
    //
    this.clearInstance = new Function('map_', 'var obj_; return ' +

      function(object, node){
        obj_ = object;
        var id = obj_.element && obj_.element.basisObjectId;
        if (id)
          delete map_[id];

        // specific code start
        _code_(); // <-- will be replaced for specific code
        // specific code end

      }

    .toString().replace('_code_()', clearBody))(tmplNodeMap);  // body.map(String.format, '{alias}=null;\n').join('')
  };


 /**
  * Creates DOM structure template from marked HTML. Use {basis.Html.Template#createInstance}
  * method to apply template to object. It creates clone of DOM structure and adds
  * links into object to pointed parts of structure.
  *
  * To remove links to DOM structure from object use {basis.Html.Template#clearInstance}
  * method.
  * @example
  *   // create a template
  *   var template = new basis.Template(
  *     '<li{element} class="listitem">' +
  *       '<a href{hrefAttr}="#">{titleText}</a>' + 
  *       '<span class="description">{descriptionText}</span>' +
  *     '</li>'
  *   );
  *   
  *   // create 10 DOM elements using template
  *   for (var i = 0; i < 10; i++)
  *   {
  *     var node = template.createInstance();
  *     basis.CSS.cssClass(node.element).add('item' + i);
  *     node.hrefAttr.nodeValue = '/foo/bar.html';
  *     node.titleText.nodeValue = 'some title';
  *     node.descriptionText.nodeValue = 'description text';
  *   }
  *   
  *   // create and attach DOM structure to existing object
  *   var dataObject = new basis.Data.DataObject({
  *     data: { title: 'Some data', value: 123 },
  *     handlers: {
  *       update: function(object, delta){
  *         this.titleText.nodeValue = this.info.title;
  *         // other DOM manipulations
  *       }
  *     }
  *   });
  *   // apply template to object
  *   template.createInstance(dataObject);
  *   // trigger update event that fill template with data
  *   dataObject.update(null, true);
  *   ...
  *   basis.dom.insert(someElement, dataObject.element);
  *   ...
  *   // destroy object
  *   template.clearInstance(dataObject);
  *   dataObject.destroy();
  * @class
  */
  var Template = Class(null, {
    className: namespace + '.Template',

    __extend__: function(value){
      if (value instanceof Template)
        return value;
      else
        return new Template(value);
    },

   /**
    * @param {string|function()} template Template source code that will be parsed
    * into DOM structure prototype. Parsing will be initiated on first
    * {basis.Html.Template#createInstance} call. If function passed it be called at
    * first {basis.Html.Template#createInstance} and it's result will be used as
    * template source code.
    * @constructor
    */
    init: function(templateSource){
      this.source = templateSource;
    },

   /**
    * Create DOM structure and return object with references for it's nodes.
    * @param {Object=} object Storage for DOM references.
    * @param {Object=} node Object which templateAction method will be called on events.
    * @return {Object}
    */
    createInstance: function(object, node){
      parseTemplate.call(this);
      return this.createInstance(object, node);
    },
    clearInstance: function(object, node){
      parseTemplate.call(this);
    }
  });


 /**
  * @func
  */
  function escape(html){
    return dom.createElement('div', dom.createText(html)).innerHTML;
  }

 /**
  * @func
  */
  var unescapeElement = document.createElement('div');
  function unescape(escapedHtml){
    unescapeElement.innerHTML = escapedHtml;
    return unescapeElement.firstChild.nodeValue;
  }

 /**
  * @func
  */
  function string2Html(text){
    unescapeElement.innerHTML = text;
    return dom.createFragment.apply(null, Array.from(unescapeElement.childNodes));
  }


  //
  // export names
  //

  return basis.namespace(namespace).extend({
    Template: Template,
    escape: escape,
    unescape: unescape,
    string2Html: string2Html
  });

}(basis, this);
