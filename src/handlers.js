/*
 *  This file is part of the OpenLink Structured Data Sniffer
 *
 *  Copyright (C) 2015-2016 OpenLink Software
 *
 *  This project is free software; you can redistribute it and/or modify it
 *  under the terms of the GNU General Public License as published by the
 *  Free Software Foundation; only version 2 of the License, dated June 1991.
 *
 *  This program is distributed in the hope that it will be useful, but
 *  WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 *  General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License along
 *  with this program; if not, write to the Free Software Foundation, Inc.,
 *  51 Franklin St, Fifth Floor, Boston, MA 02110-1301 USA
 *
 */


Handle_Microdata = function () {
  this.callback = null;
};

Handle_Microdata.prototype = {
  parse : function(jsonData, docURL, callback) {
    this.callback = callback;
    var self = this;
    try 
    {
      var conv = new MicrodataJSON_Converter();
      var out_data = conv.transform(jsonData, docURL);

      var html_data = new HTML_Gen().load(out_data);
      self.callback(null, html_data);
    } 
    catch (ex) {
      self.callback(ex.toString(), null);
    }
  }

}



Handle_Turtle = function (start_id) {
  this.callback = null;
  this.baseURI = null;
  this._pos = 0;
  this._output = null;
  this.start_id = 0;
  if (start_id!==undefined)
    this.start_id = start_id;
  this.ns_pref = null;
  this.ns_pref_size = 0;
  this.skip_error = true;
  this.skipped_error = [];
  this._pattern = /([0-9]*).$/gm;
};

Handle_Turtle.prototype = {

  parse : function(textData, docURL, callback) {
    this.callback = callback;
    this.baseURI = docURL;
    var self = this;

    if (this._pos < textData.length) {
      var store = new N3DataConverter();
      var parser = N3.Parser();
      try {
        var ttl_data = textData[self._pos];
        if (this.ns_pref!==null)
          ttl_data = this.ns_pref + ttl_data;

        parser.parse(ttl_data,
          function (error, tr, prefixes) {
            if (error) {
              error = ""+error;
              error = error.replace("<","&lt;").replace(">","&gt;");
              if (self.ns_pref_size>0) { // fix line in error message
                try {
                  var m = self._pattern.exec(error);
                  if (m!==null) 
                    error = error.substr(0,m.index)+(parseInt(m[1])-self.ns_pref_size-1);
                } catch(e) {}
              }

              if (self.skip_error) {
                self.skipped_error.push(error);
                self._pos++;

                if (self._pos < textData.length)
                  self.parse(textData, docURL, self.callback);
                else
                  self.callback(null, self._output);
              } 
              else 
              {
                self.error = error;
                self.callback(self.error, null);
              }

            }
            else if (tr) {
              store.addTriple(self.fixNode(tr.subject), 
                              self.fixNode(tr.predicate), 
                              self.fixNode(tr.object));
            }
            else {
              if (self._output===null)
                self._output = "";
              
              var triples = store.output;

              var html_str =  new HTML_Gen().load(triples, self.start_id);
              self._output += (html_str==null?"":html_str);
              self._pos++;

              if (triples!==null && triples.length!==undefined)
                self.start_id+= triples.length;

              if (self._pos < textData.length)
                self.parse(textData, docURL, self.callback);
              else
                self.callback(null, self._output);
            }
          });
      } catch (ex) {
        self.callback(ex.toString(), null);
      }
    } else {
        self.callback(null, this._output);
    }

  },


  fixNode : function (n) 
  {
     if ( n==="")
         return this.baseURI;
     else if (N3.Util.isIRI(n)) {
       if (n==="")
         return this.baseURI;
       else if (n.substring(0,1)==="#") 
         return this.baseURI+n;
       else if (n.substring(0,1)===":") 
         return this.baseURI+n;
       else
         return n;
     } else {
       return n;
     }
  }

}




Handle_JSONLD = function () {
  this.callback = null;
  this._pos = 0;
  this._output = null;
  this.start_id = 0;
  this.skip_error = true;
  this.skipped_error = [];
};

Handle_JSONLD.prototype = {

  parse : function(textData, docURL, callback) {
    this.callback = callback;
    var self = this;

    function handle_error(error) 
    {
      if (self.skip_error) 
      {
        self.skipped_error.push(""+error);
        self._pos++;

        if (self._pos < textData.length)
          self.parse(textData, docURL, self.callback);
        else
          self.callback(null, self._output);
      } 
      else {
          self.callback(""+error, null);
      }
    }


    if (this._pos < textData.length) 
    {
      try {
        jsonld_data = JSON.parse(textData[this._pos]);
        if (jsonld_data != null) {
          jsonld.expand(jsonld_data, 
            function(error, expanded) {
              if (error) {
                handle_error(error);
              }
              else {
                jsonld.toRDF(expanded, {format: 'application/nquads'}, 
                  function(error, nquads) {
                    if (error) {
                      handle_error(error);
                    }
                    else {
                      var handler = new Handle_Turtle(self.start_id);
                      handler.skip_error = false;
                      handler.parse([nquads], docURL, function(error, html_data) {
                        if (error) {
                          handle_error(error);
                        }
                        else {
                          if (self._output===null)
                            self._output = "";

                          self._output += html_data;
                          self._pos++;
                          self.start_id += handler.start_id;
 
                          if (self._pos < textData.length)
                            self.parse(textData, docURL, self.callback);
                          else
                            self.callback(null, self._output);
                        }
                      });
                    }
                });
              }
            })
        }
        else
          self.callback(null, null);
      } catch (ex) {
        self.callback(ex.toString(), null);
      }

    } else {
       self.callback(null, this._output);
    }

  }


}



Handle_RDFa = function () {
  this.callback = null;
};

Handle_RDFa.prototype = {

  parse : function(data, callback) {
    this.callback = callback;

    var self = this;
    try {
      var str = new HTML_Gen().load(data);
      self.callback(null, str);
    } catch (ex) {
      self.callback(ex.toString(), null);
    }
  }

}






//Convert N3 data to internal format
function N3DataConverter(options) {
  this._LiteralMatcher = /^"([^]*)"(?:\^\^(.+)|@([\-a-z]+))?$/i;
  this.RDF_PREFIX = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  this.RDF_TYPE   = this.RDF_PREFIX + 'type';
  this.output = [];
}

N3DataConverter.prototype = {
  addTriple: function (subj, pred, obj) 
  {
      var s = null;
      var o = null;

      for(var i=0; i < this.output.length; i++)
        if (this.output[i].s === subj) {
          s = this.output[i];
          break;
        }

      if (s == null) {
        s = {s:subj, n: this.output.length+1};
        this.output.push(s);
      }

      if (s.props === undefined) 
        s.props = new Object();
      if (s.props_obj === undefined) 
        s.props_obj = new Object();
      
      var p = s.props[pred];
      var p_obj = s.props_obj[pred];
      if  (p === undefined) {
         s.props[pred] = [];
         s.props_obj[pred] = {};
      }

      p = s.props[pred];
      p_obj = s.props_obj[pred];

      if (!p_obj[obj]) 
      {
        p_obj[obj]=1;

        if (obj[0] !=='"') {
          p.push({iri :obj});
        }
        else {
          var match = this._LiteralMatcher.exec(obj);
          if (!match) throw new Error('Invalid literal: ' + obj);
          p.push({
             value:match[1], 
             type:match[2], 
             lang:match[3]
            });
        }
      }

  }
}


//Convert Microdata JSON to internal format
function MicrodataJSON_Converter(options) {
  this._LiteralMatcher = /^"([^]*)"(?:\^\^(.+)|@([\-a-z]+))?$/i;
  this.RDF_PREFIX = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  this.RDF_TYPE   = this.RDF_PREFIX + 'type';
  this.output = [];
  this.last_Bnode = 0;
  this.baseURI;
}

MicrodataJSON_Converter.prototype = {
  transform: function (json, baseURI) 
  {
      this.baseURI = baseURI;
      var self = this;
      var out = [];

      for(var i=0; i < json.items.length; i++)
      {
        var item = json.items[i];
        var rc = this.expand_item(item);
        out.push(rc.data);
        out = out.concat(rc.data_add);
      }

      for(var i=0; i < out.length; i++)
      {
        out[i]["n"] = i+1;
        if (!out[i].s)
          out[i]["s"] = baseURI;
      }

      return out;
  },

  new_bnode : function() 
  {
    this.last_Bnode++;
    return "_:bb"+this.last_Bnode;
  },

  expand_item : function(item) 
  {
    var self =this;
    var out = { };
    var out_add = [];
    var retVal = { id:null, data:{}, data_add:[] };
    var i_props = null;
    var props = {};
    var id_ns = null;

    retVal.data = out;
    retVal.data_add = out_add;
    out["props"] = props;

    //try get current NS
    if (item.type!==undefined) {
      var ns_list = new Namespace();
      if ($.isArray(item.type)) {
        for(var i=0; i<item.type.length; i++) {
          id_ns = ns_list.has_known_ns(String(item.type[i]));
          if (id_ns)
            break;
        }
      } else {
        id_ns = ns_list.has_known_ns(String(item.type));
      }
    }


    $.each(item, function(key, val) 
     {
       if (key==="properties") {
         i_props = val;
       }
       else if (key==="id") 
       {
         if (val.indexOf(':') === -1)
           val = ":"+val;
         out["s"]=val;
         retVal.id = val;
       } 
       else if (key==="type") 
       {
         if ($.isArray(val)) {
           for(var i=0; i<val.length; i++) {
             if (val[i].indexOf(':') === -1)
               val[i] = { "iri" : ":"+val[i], typeid:1};
             else
               val[i] = { "iri" : val[i], typeid:1};
           } 
         } 
         else {
           if (val.indexOf(':') === -1)
               val = [{ "iri" : ":"+val, typeid:1}];
           else
               val = [{ "iri" : val, typeid:1}];
         } 
         props[self.RDF_TYPE] = val;
       } 
       else 
       {
         if (key.indexOf(':') === -1)
            key = ":"+key;

         if ($.isArray(val))
           props[key]=val;
         else
           props[key]=[val];
       }
     });


      function expand_sub_item(parent, val) 
      {
         var rc = self.expand_item(val);
         if (!rc.id) {
           var bnode = self.new_bnode();
           rc.id = bnode;
           rc.data.s = bnode;
         }
         parent.push({ "iri" : rc.id });
         out_add.push(rc.data);
         for(var i=0; i<rc.data_add.length; i++)
           out_add.push(rc.data_add[i]);
      }

      function handle_val(v_lst, val)
      {
         if (String(val).indexOf('[object Object]') === 0)
           expand_sub_item(v_lst, val); 
         else if (val.substring(0,7) ==="http://")
           v_lst.push({ "iri" : val});
         else if (val.substring(0,8) ==="https://")
           v_lst.push({ "iri" : val});
         else
           v_lst.push({ "value" : val}); //??todo parse literal
/**
      else {
        var match = this._LiteralMatcher.exec(obj);
        if (!match) throw new Error('Invalid literal: ' + obj);
        p.push({
             value:match[1], 
             type:match[2], 
             llang:match[3]});
      }
****/
      }

    
    if (i_props) {
      $.each(i_props, function(key, val) 
      {
        if (key.indexOf(':') === -1) {
          if (id_ns) 
            key = id_ns.link+key;
          else
            key = ":"+key;
        }

       var v = [];
/**
       if (!$.isArray(val) && String(val).indexOf('[object Object]') === 0)
       {
           expand_sub_item(v, val);
       }
       else {
         for(var i=0; i<val.length; i++) {
           if (String(val[i]).indexOf('[object Object]') === 0) //isArray lenght=1, el == Object
             expand_sub_item(v, val[i]); 
           else if (val[i].substring(0,7) ==="http://")
             v.push({ "iri" : val[i]});
           else if (val[i].substring(0,8) ==="https://")
             v.push({ "iri" : val[i]});
           else
             v.push({ "value" : val[i]}); 
         }
       }
**/
       if ($.isArray(val))
       {
         for(var i=0; i<val.length; i++)
           handle_val(v, val[i]);
       }
       else 
       {
         handle_val(v, val);
       }

       props[key] = v;
        
      });
    }

    return retVal;
  }

}
