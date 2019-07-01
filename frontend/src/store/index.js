import Vue from 'vue'
import Vuex from 'vuex'
import axios from 'axios'
import VueAxios from 'vue-axios'
import Collection from './collection'

Vue.use(Vuex)
axios.defaults.withCredentials = true
Vue.use(VueAxios, axios)

const API_ROOT = process.env.VUE_APP_ROOT_API

export const state = {
  api: {}
}

export const mutations = {
  addEmpty (state, { uri, loaded }) {
    Vue.set(state.api, uri, { _loading: true, self: uri, loaded })
  },
  add (state, data) {
    Vue.set(state.api, data.self, { ...data, loaded: new Promise(resolve => resolve(state.api[data.self])) })
  },
  appendCollectionItem (state, { collectionUri, item }) {
    state.api[collectionUri].items.push(item)
  }
}

export default new Vuex.Store({
  state,
  mutations,
  strict: process.env.NODE_ENV !== 'production'
})

function requestFromApi (vm, uri) {
  vm.$store.commit('addEmpty', {
    uri,
    loaded: new Promise((resolve) => {
      vm.axios.get(API_ROOT + uri).then(({ data }) => {
        let accessLoadedData = getStoreAccessor(vm, data)
        resolve(accessLoadedData())
      })
    })
  })
  return vm.$store.state.api[uri]
}

function getStoreAccessor (vm, data) {
  Object.keys(data).forEach(key => {
    if (data[key].hasOwnProperty('_links')) {
      // embedded single entity, replace by accessor function
      data[key] = getStoreAccessor(vm, data[key])
    } else if (Array.isArray(data[key])) {
      // embedded collection (not paginated, full list), replace by accessor function for collection of accessor functions
      let collection = Collection.fromArray(data[key].map(entry => getStoreAccessor(vm, entry)))
      data[key] = () => collection
    }
  })
  if (data.hasOwnProperty('_links')) {
    Object.entries(data._links).forEach(([key, { href: uri }]) => {
      if (key === 'self') {
        // self link, keep as URI
        data[key] = normalizedUri(uri)
      } else {
        // linked single entity or collection, replace by accessor function
        data[key] = () => vm.api(uri)
      }
    })
    delete data._links
  }
  if (data.hasOwnProperty('_embedded')) {
    // page of a collection, replace by collection of accessor functions
    data.items = data._embedded.items.map(item => getStoreAccessor(vm, item))
    delete data._embedded
    data = Collection.fromPage(vm, data)
  }
  vm.$store.commit('add', data)
  return () => vm.api(data.self)
}

function normalizedUri (uri) {
  // TODO sort query parameters so the order does not matter when paginating, filtering, sorting, ...
  if (!uri) {
    return '/'
  }
  if (uri.startsWith(API_ROOT)) {
    return uri.substr(API_ROOT.length)
  }
  return uri
}

export const api = function (uri) {
  uri = normalizedUri(uri)
  return this.$store.state.api[uri] || requestFromApi(this, uri)
}

Vue.mixin({
  methods: { api }
})

export { Collection }
