"use client"

import { useState } from "react"
import { authClient } from "@/lib/auth-client"
import { createClientErrorReporter, getUserFacingErrorMessage } from "@/lib/client-feedback"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { KeyRound, Plus, Trash2, Loader2, MonitorSmartphone } from "lucide-react"

const passkeyReporter = createClientErrorReporter("passkey")

function getPasskeyErrorMessage(error: unknown) {
  const message = getUserFacingErrorMessage(error, "")
  const normalizedMessage = message.toLowerCase()

  if (!message) {
    return "暂时无法完成通行密钥操作，请稍后重试。"
  }

  if (
    normalizedMessage.includes("notallowederror") ||
    normalizedMessage.includes("the operation either timed out or was not allowed") ||
    normalizedMessage.includes("timed out") ||
    normalizedMessage.includes("cancel")
  ) {
    return "你已取消本次通行密钥操作，未做任何更改。"
  }

  if (
    normalizedMessage.includes("notsupportederror") ||
    normalizedMessage.includes("not supported") ||
    normalizedMessage.includes("publickeycredential is not defined")
  ) {
    return "当前浏览器或设备暂不支持通行密钥。"
  }

  if (
    normalizedMessage.includes("securityerror") ||
    normalizedMessage.includes("security") ||
    normalizedMessage.includes("https") ||
    normalizedMessage.includes("rp id")
  ) {
    return "当前环境不满足通行密钥安全要求，请确认正在使用受信任的 HTTPS 域名。"
  }

  if (
    normalizedMessage.includes("invalidstateerror") ||
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("duplicate")
  ) {
    return "这个设备上的通行密钥已经添加过了，无需重复创建。"
  }

  return "暂时无法完成通行密钥操作，请稍后重试。"
}

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
        passkeyReporter.warn("add_failed_response", { error: res.error })
        toast.error(getPasskeyErrorMessage(res.error))
      } else {
        toast.success("通行密钥已添加")
        refetch()
      }
    } catch (error) {
      passkeyReporter.report("add_failed_exception", error)
      toast.error(getPasskeyErrorMessage(error))
    } finally {
      setLoadingAdd(false)
    }
  }

  async function handleDeletePasskey(id: string) {
    setDeleteId(id)
    try {
      const res = await authClient.passkey.deletePasskey({ id })
      if (res?.error) {
        passkeyReporter.warn("delete_failed_response", { passkeyId: id, error: res.error })
        toast.error("删除通行密钥失败，请稍后重试。")
      } else {
        toast.success("通行密钥已删除")
        refetch()
      }
    } catch (error) {
      passkeyReporter.report("delete_failed_exception", error, { passkeyId: id })
      toast.error("删除通行密钥失败，请稍后重试。")
    } finally {
      setDeleteId(null)
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          通行密钥
        </CardTitle>
        {supportsPasskey && (
          <Button onClick={handleAddPasskey} disabled={loadingAdd || isPending} size="sm">
            {loadingAdd ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            添加
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!supportsPasskey ? (
          <div className="text-sm text-muted-foreground">当前环境不支持通行密钥。</div>
        ) : isPending ? (
          <div className="flex items-center justify-center py-8 text-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            加载中...
          </div>
        ) : !passkeys?.length ? (
          <div className="py-10 text-center text-sm text-muted-foreground">还没有通行密钥。</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>设备</TableHead>
                  <TableHead className="hidden w-32 sm:table-cell">创建时间</TableHead>
                  <TableHead className="w-24 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {passkeys.map((pk: { id: string; name?: string; backedUp: boolean; credentialID: string; createdAt: Date }) => (
                  <TableRow key={pk.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{pk.name || "未命名设备"}</span>
                        {pk.backedUp && (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                            已备份
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 max-w-[200px] truncate break-all font-mono text-xs text-muted-foreground">
                        {pk.credentialID?.substring(0, 16)}...
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {pk.createdAt ? new Date(pk.createdAt).toLocaleDateString() : "未知"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePasskey(pk.id)}
                        disabled={deleteId === pk.id}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        aria-label={`删除通行密钥 ${pk.name || "未命名设备"}`}
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
