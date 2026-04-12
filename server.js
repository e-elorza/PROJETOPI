const express = require("express")
const Database = require("better-sqlite3")
const fs = require("fs")
const multer = require('multer')

const upload = multer({ storage: multer.memoryStorage() })
const app = express()
app.use(express.static(__dirname))
const banco = new Database("banco.db")

banco.pragma("foreign_keys = ON")
banco.prepare("CREATE TABLE IF NOT EXISTS clientes (id_cliente INTEGER PRIMARY KEY AUTOINCREMENT, nome_empresa TEXT, cnpj VARCHAR(14), nome_pessoa TEXT)").run()

banco.prepare(`
CREATE TABLE IF NOT EXISTS vendas (
  id_venda INTEGER PRIMARY KEY AUTOINCREMENT,
  id_cliente INTEGER,
  descricao TEXT,
  data_venda TEXT,
  valor_venda DECIMAL,
  comissao INTEGER,
  FOREIGN KEY (id_cliente) 
  REFERENCES clientes(id_cliente)
  ON DELETE CASCADE
)
`).run()

banco.prepare(`
  CREATE TABLE IF NOT EXISTS pdfs (
    id_pdf      INTEGER PRIMARY KEY AUTOINCREMENT,
    id_cliente  INTEGER,
    nome        TEXT,
    dados       BLOB,
    FOREIGN KEY (id_cliente)
    REFERENCES clientes(id_cliente)
    ON DELETE CASCADE
  )
`).run()

app.get("/", (req, res) => {
  try {
    const clientes = banco.prepare("SELECT * FROM clientes").all()

    let itens = ""
    for (let i = 0; i < clientes.length; i++) {
      let cliente = clientes[i]
      itens = itens + "<tr>" +
        "<td><a href='/cliente?id_cliente=" + cliente.id_cliente + "'>" + cliente.nome_empresa + "</a></td>" +
        "<td><a href='/delete_cliente?id_cliente=" + cliente.id_cliente + "'>Excluir</a></td>" +
        "</tr>"
    }

    let pagina = fs.readFileSync("index.template.html", "utf8")
    pagina = pagina.replace("__LISTACLIENTES__", itens)
    res.send(pagina)
  } catch (erro) {
    console.error("Erro ao carregar clientes:", erro.message)
    res.status(500).send("<p>Erro ao carregar a lista de clientes. Tente novamente.</p>")
  }
})

app.get("/salvar_cliente", (req, res) => {
  try {
    const nome_empresa = req.query.nome_empresa
    const cnpj = req.query.cnpj
    const nome_pessoa = req.query.nome_pessoa

    if (!nome_empresa || !cnpj || !nome_pessoa) {
      return res.status(400).send("<p>Erro: todos os campos são obrigatórios. <a href='/'>Voltar</a></p>")
    }

    if (cnpj.length !== 14) {
      return res.status(400).send("<p>Erro: CNPJ deve ter 14 caracteres. <a href='/'>Voltar</a></p>")
    }

    banco.prepare(`
      INSERT INTO clientes (nome_empresa, cnpj, nome_pessoa)
      VALUES (?, ?, ?)
    `).run(nome_empresa, cnpj, nome_pessoa)

    res.redirect("/")
  } catch (erro) {
    console.error("Erro ao salvar cliente:", erro.message)
    res.status(500).send("<p>Erro ao salvar cliente. Tente novamente. <a href='/'>Voltar</a></p>")
  }
})

app.get("/delete_cliente", (req, res) => {
  try {
    const id_cliente = req.query.id_cliente

    if (!id_cliente) {
      return res.status(400).send("<p>Erro: ID do cliente não informado. <a href='/'>Voltar</a></p>")
    }

    banco.prepare("DELETE FROM clientes WHERE id_cliente = ?").run(id_cliente)
    res.redirect("/")
  } catch (erro) {
    console.error("Erro ao excluir cliente:", erro.message)
    res.status(500).send("<p>Erro ao excluir cliente. Tente novamente. <a href='/'>Voltar</a></p>")
  }
})

app.get("/cliente", (req, res) => {
  try {
    const id_cliente = req.query.id_cliente

    if (!id_cliente) {
      return res.status(400).send("<p>Erro: ID do cliente não informado. <a href='/'>Voltar</a></p>")
    }

    const cliente = banco.prepare("SELECT * FROM clientes WHERE id_cliente = ?").get(id_cliente)

    if (!cliente) {
      return res.status(404).send("<p>Erro: cliente não encontrado. <a href='/'>Voltar</a></p>")
    }

    let pagina = fs.readFileSync("cliente.template.html", "utf8")
    pagina = pagina.replaceAll("__ID__", cliente.id_cliente)
    pagina = pagina.replace("__EMPRESA__", cliente.nome_empresa)
    pagina = pagina.replace("__REPRESENTANTE__", cliente.nome_pessoa)
    pagina = pagina.replace("__CNPJ__", cliente.cnpj)
    pagina = pagina.replace("__NOMECLIENTE__", cliente.nome_empresa)

    // JOIN entre vendas e clientes para apresentar dados combinados
    const vendas = banco.prepare(`
      SELECT vendas.*, clientes.nome_empresa
      FROM vendas
      JOIN clientes ON vendas.id_cliente = clientes.id_cliente
      WHERE vendas.id_cliente = ?
    `).all(id_cliente)

    let itens = ""
    for (let i = 0; i < vendas.length; i++) {
      let venda = vendas[i]
      itens = itens + "<tr>" +
        "<td>" + venda.nome_empresa + "</td>" +
        "<td>R$" + venda.valor_venda + "</td>" +
        "<td>" + venda.comissao + "%</td>" +
        "<td>R$" + (venda.valor_venda * (venda.comissao / 100)).toFixed(2) + "</td>" +
        "<td>" + venda.data_venda + "</td>" +
        "<td><a href='/excluir_venda?id_venda=" + venda.id_venda + "&id_cliente=" + cliente.id_cliente + "'>Excluir Venda</a></td>" +
        "</tr>"
    }

    const pdfs = banco.prepare("SELECT * FROM pdfs WHERE id_cliente = ?").all(id_cliente)
    let opcoesPdf = ""
    for (let i = 0; i < pdfs.length; i++) {
      let pdf = pdfs[i]
      opcoesPdf = opcoesPdf + "<option value='" + pdf.id_pdf + "'>" + pdf.nome + "</option>"
    }

    pagina = pagina.replace("__PDFSOPTIONS__", opcoesPdf)
    pagina = pagina.replace("__LISTAVENDAS__", itens)
    res.send(pagina)
  } catch (erro) {
    console.error("Erro ao carregar cliente:", erro.message)
    res.status(500).send("<p>Erro ao carregar dados do cliente. <a href='/'>Voltar</a></p>")
  }
})

app.get("/salvar_venda", (req, res) => {
  try {
    const id_cliente = req.query.id_cliente
    const valor_venda = req.query.valor_venda
    const descricao = req.query.descricao
    const comissao = req.query.comissao
    const data_venda = req.query.data_venda

    if (!id_cliente || !valor_venda || !data_venda || !descricao || !comissao) {
      return res.status(400).send("<p>Erro: todos os campos são obrigatórios. <a href='javascript:history.back()'>Voltar</a></p>")
    }

    if (isNaN(valor_venda) || Number(valor_venda) <= 0) {
      return res.status(400).send("<p>Erro: valor da venda inválido. <a href='javascript:history.back()'>Voltar</a></p>")
    }

    if (isNaN(comissao) || Number(comissao) < 0 || Number(comissao) > 100) {
      return res.status(400).send("<p>Erro: comissão deve ser entre 0 e 100. <a href='javascript:history.back()'>Voltar</a></p>")
    }

    banco.prepare(`
      INSERT INTO vendas (id_cliente, valor_venda, descricao, comissao, data_venda)
      VALUES (?, ?, ?, ?, ?)
    `).run(id_cliente, valor_venda, descricao, comissao, data_venda)

    res.redirect("/cliente?id_cliente=" + id_cliente)
  } catch (erro) {
    console.error("Erro ao salvar venda:", erro.message)
    res.status(500).send("<p>Erro ao salvar venda. Tente novamente. <a href='javascript:history.back()'>Voltar</a></p>")
  }
})

app.get("/excluir_venda", (req, res) => {
  try {
    const id_venda = req.query.id_venda
    const id_cliente = req.query.id_cliente

    if (!id_venda) {
      return res.status(400).send("<p>Erro: ID da venda não informado. <a href='/'>Voltar</a></p>")
    }

    banco.prepare("DELETE FROM vendas WHERE id_venda = ?").run(id_venda)
    res.redirect('/cliente?id_cliente=' + id_cliente)
  } catch (erro) {
    console.error("Erro ao excluir venda:", erro.message)
    res.status(500).send("<p>Erro ao excluir venda. Tente novamente. <a href='/'>Voltar</a></p>")
  }
})

app.post('/upload_pdf', upload.single('pdf'), (req, res) => {
  try {
    const id_cliente = req.query.id_cliente

    if (!req.file) {
      return res.status(400).send("<p>Erro: nenhum arquivo enviado. <a href='javascript:history.back()'>Voltar</a></p>")
    }

    banco.prepare(
      'INSERT INTO pdfs (id_cliente, nome, dados) VALUES (?, ?, ?)'
    ).run(id_cliente, req.file.originalname, req.file.buffer)

    res.redirect('/cliente?id_cliente=' + id_cliente)
  } catch (erro) {
    console.error("Erro ao fazer upload do PDF:", erro.message)
    res.status(500).send("<p>Erro ao enviar PDF. Tente novamente. <a href='javascript:history.back()'>Voltar</a></p>")
  }
})

app.get('/pdf/download', (req, res) => {
  try {
    const id_pdf = req.query.id_pdf

    if (!id_pdf) {
      return res.status(400).send("<p>Erro: ID do PDF não informado. <a href='/'>Voltar</a></p>")
    }

    const pdf = banco.prepare('SELECT nome, dados FROM pdfs WHERE id_pdf = ?').get(id_pdf)

    if (!pdf) {
      return res.status(404).send("<p>Erro: PDF não encontrado. <a href='/'>Voltar</a></p>")
    }

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename=' + pdf.nome)
    res.send(pdf.dados)
  } catch (erro) {
    console.error("Erro ao baixar PDF:", erro.message)
    res.status(500).send("<p>Erro ao baixar PDF. Tente novamente. <a href='/'>Voltar</a></p>")
  }
})

app.get('/excluir_pdf', (req, res) => {
  try {
    const id_pdf = req.query.id_pdf

    if (!id_pdf) {
      return res.status(400).send("<p>Erro: ID do PDF não informado. <a href='/'>Voltar</a></p>")
    }

    banco.prepare('DELETE FROM pdfs WHERE id_pdf = ?').run(id_pdf)
    res.redirect('/cliente?id_cliente=' + req.query.id_cliente)
  } catch (erro) {
    console.error("Erro ao excluir PDF:", erro.message)
    res.status(500).send("<p>Erro ao excluir PDF. Tente novamente. <a href='/'>Voltar</a></p>")
  }
})

app.listen(3000, () => {
  console.log("Servidor rodando")
})