"use client"

import { useState } from "react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { KeyRound, Plus, Trash2, Loader2, MonitorSmartphone } from "lucide-react"

export function PasskeyManager() {
    const { data: passkeys, isPending, refetch } = authClient.useListPasskeys()
    const [loadingAdd, setLoadingAdd] = useState(false)
    const [deleteId, setDeleteId] = useState<string | null>(null)

    const supportsPasskey =
        typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined"

    async function handleAddPasskey() {
        setLoadingAdd(true)
        try {
            const res = await authClient.passkey.addPasskey({
                name: `${navigator.platform} - ${new Date().toLocaleDateString()}`,
            })
            if (res?.error) {
                const message = typeof res.error.message === "string" ? res.error.message : "无法保存 Passkey"
                toast.error(message)
            } else {
                toast.success("Passkey 已成功保存")
                refetch()
            }
        } catch (e) {
            console.error(e)
            toast.error("添加失败")
        } finally {
            setLoadingAdd(false)
        }
    }

    async function handleDeletePasskey(id: string) {
        setDeleteId(id)
        try {
            const res = await authClient.passkey.deletePasskey({
                id,
            })
            if (res?.error) {
                const message = typeof res.error.message === "string" ? res.error.message : "删除失败"
                toast.error(message)
            } else {
                toast.success("Passkey 已删除")
                refetch()
            }
        } catch (e) {
            console.error(e)
            toast.error("删除失败")
        } finally {
            setDeleteId(null)
        }
    }

    return (
        <Card className="max-w-3xl">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <KeyRound className="h-5 w-5" />
                            通行密钥 (Passkey)
                        </CardTitle>
                        <CardDescription className="mt-1">
                            使用通行密钥（如指纹、面容ID或安全密钥）以更安全、快捷的方式登录。
                        </CardDescription>
                    </div>
                    {supportsPasskey && (
                        <Button onClick={handleAddPasskey} disabled={loadingAdd || isPending}>
                            {loadingAdd ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Plus className="h-4 w-4 mr-2" />
                            )}
                            添加通行密钥
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {!supportsPasskey && (
                    <div className="bg-muted p-4 rounded-md text-sm mb-4">
                        您的浏览器当前不支持通行密钥，或者未处于安全环境 (https) 中。
                    </div>
                )}

                {isPending ? (
                    <div className="py-8 text-center text-muted-foreground flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        加载中...
                    </div>
                ) : !passkeys?.length ? (
                    <div className="text-center text-muted-foreground py-12 border rounded-lg bg-background/50 border-dashed">
                        <KeyRound className="h-8 w-8 mx-auto mb-3 opacity-20" />
                        <p>您尚未添加任何通行密钥</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>名称 / 设备</TableHead>
                                    <TableHead className="w-32 hidden sm:table-cell">创建时间</TableHead>
                                    <TableHead className="w-24 text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {passkeys.map((pk: { id: string, name?: string, backedUp: boolean, credentialID: string, createdAt: Date }) => (
                                    <TableRow key={pk.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-medium">
                                                    {pk.name || "未命名设备"}
                                                </span>
                                                {pk.backedUp && (
                                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">已备份</Badge>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1 font-mono break-all max-w-[200px] truncate">
                                                ID: {pk.credentialID?.substring(0, 16)}...
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                                            {pk.createdAt ? new Date(pk.createdAt).toLocaleDateString() : "未知"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeletePasskey(pk.id)}
                                                disabled={deleteId === pk.id}
                                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                                title="Delete passkey"
                                            >
                                                {deleteId === pk.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
