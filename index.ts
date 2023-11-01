import { BskyAgent } from '@atproto/api'
import xlsx from 'node-xlsx'

const MUTELIST = "at:// uri for mute list"

// TODO: rem knows who they are, block their ass rem
const THEM = "did of someone"

async function getFollows (agent:BskyAgent) : Promise<string[]> {
  const actor = agent.session!.did
  const follows:string[] = []
  const limit = 100

  var cursor:string|undefined = undefined
  var done = false
  while (!done) {
    var res = await agent.getFollows({"actor": actor, "cursor": cursor, "limit": limit})

    res.data.follows.forEach( profile => follows.push(profile.did) )

    cursor = res.data.cursor
    if ( ! cursor || ( res.data.follows.length < limit ) )  {
      done = true
    }
  }

  return new Promise((resolve, reject) => { resolve(follows.sort()) });
}

async function getFollowers (agent:BskyAgent) : Promise<string[]> {
  const actor = agent.session!.did
  const followers:string[] = []
  const limit = 100

  var cursor:string|undefined = undefined
  var done = false
  while (!done) {
    var res = await agent.getFollowers({"actor": actor, "cursor": cursor, "limit": limit})

    res.data.followers.forEach( profile => followers.push(profile.did) )

    cursor = res.data.cursor
    if ( ! cursor || ( res.data.followers.length < limit ) )  {
      done = true
    }
  }

  return new Promise((resolve, reject) => { resolve(followers.sort()) });
}

async function getBlocks (agent:BskyAgent) : Promise<string[]> {
  const blocks:string[] = []
  const limit = 100

  var cursor:string|undefined = undefined
  var done = false
  while (!done) {
    var res = await agent.app.bsky.graph.getBlocks({"cursor": cursor, "limit": limit})

    res.data.blocks.forEach( profile => blocks.push(profile.did) )

    cursor = res.data.cursor
    if ( ! cursor || ( res.data.blocks.length < limit ) )  {
      done = true
    }
  }

  return new Promise((resolve, reject) => { resolve(blocks.sort()) });
}

async function followBack (agent:BskyAgent) {
  const follows = (await getFollows(agent)).reduce((m, did) => {
    m.set(did, true)
    return m
  }, new Map())

  const followers = await getFollowers(agent)
  for (const did of followers) {
    if ( follows.get(did) ) continue
  
    console.log(`following back ${did}`)

    agent.app.bsky.graph.follow.create({
      "repo": agent.session!.did
    }, {
      "createdAt": new Date().toISOString(),
      "subject": did
    })
  }  
}

async function blockThem(agent:BskyAgent) {
  const blocks = await getBlocks(agent)
  if ( blocks.find( blocking => blocking == THEM ) ) {
    return
  }

  console.log(`blocking ${THEM}`)

  return agent.app.bsky.graph.block.create({
    "repo": agent.session!.did
  }, {
    "createdAt": new Date().toISOString(),
    "subject": THEM
  })  
}

async function getMuteLists (agent:BskyAgent) : Promise<string[]> {
  const actor = agent.session!.did
  const lists:string[] = []
  const limit = 100

  var cursor:string|undefined = undefined
  var done = false
  while (!done) {
    var res = await agent.app.bsky.graph.getListMutes({"cursor": cursor, "limit": limit})
    res.data.lists.forEach( list => lists.push(list.uri) )

    cursor = res.data.cursor
    if ( ! cursor || ( res.data.lists.length < limit ) )  {
      done = true
    }
  }

  return new Promise((resolve, reject) => { resolve(lists.sort()) });
}

async function subscribeMutes(agent:BskyAgent) {
  const lists = await getMuteLists(agent)
  if ( lists.find( list => list == MUTELIST ) ) {
    return
  }

  console.log(`subscribing to mute list ${MUTELIST}`)

  return agent.app.bsky.graph.muteActorList({
    list: MUTELIST
  })
}

async function syncAccount (username:string, password:string) {
  const agent = new BskyAgent({ service: 'https://bsky.social' })

  const did = await agent.login({
    identifier: username,
    password: password,
  }).then(response => {
    return response.data.did
  }).catch(reason => {
    console.log( reason.status == 401 ? `WARNING: could not log in as \`${username}\`. skipping..` : reason )
    return null
  })
  if ( ! did ) {
    return
  }

  await blockThem(agent)
  await followBack(agent)
  await subscribeMutes(agent)
}

function loadAccounts (path:string) {
  const ws = xlsx.parse(path);
  return ws[0].data.slice(1).filter( cell => cell.length > 0 )
}

async function main() {
  const argv = process.argv.slice(2)
  if ( argv.length != 1 ) {
    console.error("USAGE: %s FILE", process.argv[1])
    return process.exit(1)
  }

  const accounts = loadAccounts(argv[0])
  for (const account of accounts) {
    await syncAccount(account[0], account[1])
  }
}

main();