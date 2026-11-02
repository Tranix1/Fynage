import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { collection, getDocs, getFirestore, query, where } from "@react-native-firebase/firestore";
import { getAuth } from "@react-native-firebase/auth";
import { Ionicons } from "@expo/vector-icons";
import ScreenWrapper from "@/components/ScreenWrapper";
import { ThemedText } from "@/components/ThemedText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { callArmament } from "@/services/integrations/armamentApi";

type Business = { id: string; name: string; sourceApp: string; role: string };
type Member = { id: string; userId: string; role: string; status: string };
type Invitation = { id: string; businessId: string; role: string; status: string };
type Candidate = { uid: string; name: string; phoneHint: string };

export default function BusinessMembersScreen() {
  const uid = getAuth().currentUser?.uid;
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selected, setSelected] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [outgoingInvitations, setOutgoingInvitations] = useState<Invitation[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [role, setRole] = useState<"admin" | "employee" | "investor">("employee");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const accent = useThemeColor("accent"); const surface = useThemeColor("backgroundLight"); const border = useThemeColor("border"); const muted = useThemeColor("textlight");
  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      const [businessResult, inviteSnapshot] = await Promise.all([
        callArmament<{ businesses: Business[] }>("listArmamentBusinesses"),
        getDocs(query(collection(getFirestore(), "invitations"), where("targetUid", "==", uid), where("status", "==", "pending"))),
      ]);
      setBusinesses(businessResult.businesses);
      const activeId = businessResult.businesses.some((item) => item.id === selected) ? selected : businessResult.businesses[0]?.id ?? "";
      setSelected(activeId);
      setInvitations(inviteSnapshot.docs.map((item) => ({ id: item.id, businessId: String(item.data().businessId), role: String(item.data().role), status: String(item.data().status) })));
      if (activeId) {
        const outgoing = await getDocs(query(collection(getFirestore(), "invitations"), where("businessId", "==", activeId), where("invitedByUid", "==", uid), where("status", "==", "pending")));
        setOutgoingInvitations(outgoing.docs.map((item) => ({ id: item.id, businessId: activeId, role: String(item.data().role), status: "pending" })));
        const activeBusiness = businessResult.businesses.find((item) => item.id === activeId);
        const constraints = activeBusiness?.role === "owner" || activeBusiness?.role === "admin"
          ? [where("businessId", "==", activeId), where("status", "==", "active")]
          : [where("userId", "==", uid), where("businessId", "==", activeId), where("status", "==", "active")];
        const memberSnapshot = await getDocs(query(collection(getFirestore(), "businessMemberships"), ...constraints));
        setMembers(memberSnapshot.docs.map((item) => ({ id: item.id, userId: String(item.data().userId), role: String(item.data().role), status: String(item.data().status) })));
      } else { setMembers([]); setOutgoingInvitations([]); }
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Team information could not be loaded."); }
  }, [uid, selected]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const run = async (action: () => Promise<unknown>) => { setBusy(true); setError(""); try { await action(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : "The request failed."); } finally { setBusy(false); } };
  const selectedBusiness = businesses.find((item) => item.id === selected);
  const canManage = selectedBusiness?.role === "owner" || selectedBusiness?.role === "admin";
  const searchUsers = () => void run(async () => {
    if (!selected) throw new Error("Choose a business first.");
    const result = await callArmament<{ users: Candidate[] }>("searchArmamentUsers", { businessId: selected, term: searchTerm.trim() });
    setCandidates(result.users);
    if (!result.users.length) setError("No registered Armament user matched that exact phone number or name.");
  });
  return <ScreenWrapper fh={false}><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.header}><View><ThemedText type="title">Business access</ThemedText><ThemedText type="tiny" color={muted}>Memberships are enforced by Armament services.</ThemedText></View><Ionicons name="people-outline" size={25} color={accent} /></View>
    {error ? <ThemedText color="#a33">{error}</ThemedText> : null}
    {invitations.length > 0 ? <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}><ThemedText type="subtitle">Invitations for you</ThemedText>{invitations.map((invite) => <View key={invite.id} style={styles.row}><ThemedText style={styles.grow}>{invite.role} · {businesses.find((b) => b.id === invite.businessId)?.name ?? invite.businessId}</ThemedText><Pressable disabled={busy} onPress={() => void run(() => callArmament("respondArmamentInvitation", { invitationId: invite.id, response: "accepted" }))}><ThemedText color={accent}>Accept</ThemedText></Pressable><Pressable disabled={busy} onPress={() => void run(() => callArmament("respondArmamentInvitation", { invitationId: invite.id, response: "rejected" }))}><ThemedText color="#a33">Reject</ThemedText></Pressable></View>)}</View> : null}
    <ThemedText type="subtitle">Your businesses</ThemedText>
    {businesses.map((business) => <Pressable key={business.id} onPress={() => setSelected(business.id)} style={[styles.choice, { borderColor: selected === business.id ? accent : border, backgroundColor: surface }]}><View style={styles.grow}><ThemedText type="defaultSemiBold">{business.name}</ThemedText><ThemedText type="tiny" color={muted}>{business.sourceApp} · {business.role}</ThemedText></View>{selected === business.id ? <Ionicons name="checkmark-circle" size={19} color={accent} /> : null}</Pressable>)}
    {selectedBusiness ? <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
      <ThemedText type="subtitle">Members</ThemedText>
      {members.map((member) => <View key={member.id} style={styles.row}><ThemedText style={styles.grow}>{member.userId === uid ? "You" : member.userId} · {member.role}</ThemedText>{canManage && member.role !== "owner" ? <Pressable disabled={busy} onPress={() => void run(() => callArmament("revokeArmamentMember", { businessId: selected, memberUid: member.userId }))}><ThemedText color="#a33">Revoke</ThemedText></Pressable> : null}</View>)}
      {outgoingInvitations.map((invite) => <View key={invite.id} style={styles.row}><ThemedText style={styles.grow}>Pending invitation · {invite.role}</ThemedText><Pressable disabled={busy} onPress={() => void run(() => callArmament("revokeArmamentInvitation", { invitationId: invite.id }))}><ThemedText color="#a33">Cancel</ThemedText></Pressable></View>)}
      {canManage ? <>
        <ThemedText type="tiny" color={muted}>Search using an exact international phone number or display name.</ThemedText>
        <TextInput value={searchTerm} onChangeText={setSearchTerm} placeholder="+263771234567 or exact name" autoCapitalize="words" style={styles.input} />
        <Pressable disabled={busy || !searchTerm.trim()} onPress={searchUsers} style={[styles.choice, { borderColor: accent }]}><ThemedText color={accent}>Search users</ThemedText></Pressable>
        {candidates.map((candidate) => <Pressable key={candidate.uid} disabled={busy} onPress={() => void run(async () => {
          await callArmament("inviteArmamentMember", { businessId: selected, targetUid: candidate.uid, role });
          setCandidates([]); setSearchTerm("");
        })} style={[styles.choice, { borderColor: border }]}><View style={styles.grow}><ThemedText type="defaultSemiBold">{candidate.name}</ThemedText><ThemedText type="tiny" color={muted}>{candidate.phoneHint}</ThemedText></View><ThemedText color={accent}>Invite as {role}</ThemedText></Pressable>)}
        <Pressable onPress={() => setRole((value) => selectedBusiness.role !== "owner" ? value === "employee" ? "investor" : "employee" : value === "employee" ? "investor" : value === "investor" ? "admin" : "employee")} style={styles.choice}><ThemedText>Role: {role} · tap to change</ThemedText></Pressable>
      </> : <ThemedText type="tiny" color={muted}>Only an owner or admin can invite or revoke members.</ThemedText>}
    </View> : <ThemedText type="tiny" color={muted}>No registered Armament businesses are available yet. Open Murimi or Tengesa online to register its current account.</ThemedText>}
  </ScrollView></ScreenWrapper>;
}

const styles = StyleSheet.create({ page: { padding: 18, paddingBottom: 38, gap: 13 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, card: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 10 }, row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 5 }, grow: { flex: 1 }, choice: { minHeight: 47, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 }, input: { minHeight: 46, borderWidth: 1, borderColor: "#cbd5ce", borderRadius: 9, backgroundColor: "#fff", paddingHorizontal: 12, color: "#1c2921" }, button: { minHeight: 46, borderRadius: 9, alignItems: "center", justifyContent: "center" } });
