import { Client, Teams, Functions, Locale, Avatars, Graphql } from 'appwrite'

const client = new Client()
const teams = new Teams(client)
const functions = new Functions(client)
const locale = new Locale(client)
const avatars = new Avatars(client)
const graphql = new Graphql(client)

client.setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT).setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID)

export default client
export { client, teams, functions, locale, avatars, graphql }
