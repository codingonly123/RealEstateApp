import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
  Account,
  Avatars,
  Client,
  Databases,
  OAuthProvider,
  Query,
} from "react-native-appwrite";
import "react-native-url-polyfill/auto";

WebBrowser.maybeCompleteAuthSession();

export const config = {
  platform: "com.jsm.restate",
  endpoint: process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT,
  projectId: process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID,
  databaseId: process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID,
  galleriesCollectionId:
    process.env.EXPO_PUBLIC_APPWRITE_GALLERIES_COLLECTION_ID,
  reviewsCollectionId: process.env.EXPO_PUBLIC_APPWRITE_REVIEWS_COLLECTION_ID,
  agentsCollectionId: process.env.EXPO_PUBLIC_APPWRITE_AGENTS_COLLECTION_ID,
  propertiesCollectionId:
    process.env.EXPO_PUBLIC_APPWRITE_PROPERTIES_COLLECTION_ID,
};

export const client = new Client();

client
  .setEndpoint(config.endpoint!)
  .setProject(config.projectId!)
  .setPlatform(config.platform!);

export const avatar = new Avatars(client);
export const account = new Account(client);
export const databases = new Databases(client);

export async function login(): Promise<{ success: boolean; error?: string }> {
  try {
    const redirectUri = Linking.createURL("/");
    console.log("[Appwrite Auth] 1. Redirect URI:", redirectUri);

    const response = await account.createOAuth2Token(
      OAuthProvider.Google,
      redirectUri,
      redirectUri,
    );

    if (!response) {
      throw new Error("Failed to create OAuth token from Appwrite");
    }

    console.log("[Appwrite Auth] 2. OAuth Token URL:", response.toString());

    const browserResult = await WebBrowser.openAuthSessionAsync(
      response.toString(),
      redirectUri,
    );

    console.log("[Appwrite Auth] 3. Browser Result:", browserResult);

    if (browserResult.type !== "success") {
      throw new Error(
        `Sign-in browser was closed or cancelled (${browserResult.type})`,
      );
    }

    const url = new URL(browserResult.url);
    console.log("[Appwrite Auth] 4. Redirect Callback URL:", browserResult.url);

    const secret = url.searchParams.get("secret")?.toString();
    const userId = url.searchParams.get("userId")?.toString();

    if (!secret || !userId) {
      const errorParam = url.searchParams.get("error")?.toString();
      throw new Error(
        errorParam
          ? `OAuth Error: ${errorParam}`
          : "Invalid login response: missing userId or secret in callback URL",
      );
    }

    // Clear any stale active session (Appwrite rejects createSession if one is active)
    try {
      await account.deleteSession("current");
    } catch {
      // Ignore if no active session existed
    }

    const session = await account.createSession(userId, secret);
    console.log(
      "[Appwrite Auth] 5. Session created successfully:",
      session.$id,
    );

    if (!session) {
      throw new Error("Failed to create session with credentials");
    }

    return { success: true };
  } catch (error: any) {
    console.error("[Appwrite Auth] Error:", error);
    return {
      success: false,
      error: error?.message || "Failed to log in",
    };
  }
}

export async function logout() {
  try {
    await account.deleteSession("current");
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

export async function getCurrentUser() {
  try {
    const response = await account.get();

    if (response.$id) {
      const userAvatar = avatar.getInitials(response.name);

      return {
        ...response,
        avatar: userAvatar.toString(),
      };
    }

    return null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function getLatestProperties() {
  try {
    const result = await databases.listDocuments(
      config.databaseId!,
      config.propertiesCollectionId!,
      [Query.orderDesc("$createdAt"), Query.limit(5)],
    );

    return result.documents;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getProperties({
  filter,
  query,
  limit,
}: {
  filter: string;
  query: string;
  limit?: number;
}) {
  try {
    const buildQuery = [Query.orderDesc("$createdAt")];

    if (filter && filter !== "All")
      buildQuery.push(Query.equal("type", filter));

    if (query) {
      buildQuery.push(
        Query.or([
          Query.search("name", query),
          Query.search("address", query),
          Query.search("type", query),
        ]),
      );
    }

    if (limit) buildQuery.push(Query.limit(limit));

    const result = await databases.listDocuments(
      config.databaseId!,
      config.propertiesCollectionId!,
      buildQuery,
    );

    return result.documents;
  } catch (error) {
    console.error(error);
    return [];
  }
}

// write function to get property by id
export async function getPropertyById({ id }: { id: string }) {
  try {
    const result = await databases.getDocument(
      config.databaseId!,
      config.propertiesCollectionId!,
      id,
    );
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}
