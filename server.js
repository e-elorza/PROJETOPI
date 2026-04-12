const express = require("express")
const Database = require("better-sqlite3")
const fs = require("fs")
const multer = require('multer')

const upload = multer({ storage: multer.memoryStorage() })
const app = express()
app.use(express.static(__dirname))
const banco = new Database("banco.db")

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
  const clientes = banco.prepare("SELECT * FROM clientes").all()

  let itens = ""

  for (let i = 0; i < clientes.length; i++) {
    let cliente = clientes[i]
    itens = itens + "<tr>" +
  "<td><a href='/cliente?id_cliente="+ cliente.id_cliente + "'>"+ cliente.nome_empresa +"</a></td>" +
  "<td><a href='/delete_cliente?id_cliente="+ cliente.id_cliente +"'>Excluir</a></td>" +
  "</tr>"
  }

  let pagina = fs.readFileSync("index.template.html", "utf8")
  pagina = pagina.replace("__LISTACLIENTES__", itens)

  res.send(pagina)
})

app.get("/salvar_cliente", (req, res) => {

  const nome_empresa = req.query.nome_empresa
  const cnpj = req.query.cnpj
  const nome_pessoa = req.query.nome_pessoa

  if (nome_empresa && cnpj && nome_pessoa) {
    banco.prepare(`
      INSERT INTO clientes (nome_empresa, cnpj, nome_pessoa)
      VALUES (?, ?, ?)
    `).run(nome_empresa, cnpj, nome_pessoa)
  }

  res.redirect("/")
})

app.get("/delete_cliente", (req, res) => {
  const id_cliente = req.query.id_cliente

  if (id_cliente) {
    banco.prepare("DELETE FROM clientes WHERE id_cliente = ?").run(id_cliente)
  }

  res.redirect("/")
})

app.get("/cliente", (req, res) => {
  const id_cliente = req.query.id_cliente
  const cliente = banco.prepare("SELECT * FROM clientes WHERE id_cliente = ?").get(id_cliente)
  
  let pagina = fs.readFileSync("cliente.template.html", "utf8")

  pagina = pagina.replaceAll("__ID__", cliente.id_cliente)
  pagina = pagina.replace("__EMPRESA__", cliente.nome_empresa)
  pagina = pagina.replace("__REPRESENTANTE__", cliente.nome_pessoa)
  pagina = pagina.replace("__CNPJ__", cliente.cnpj)
  pagina = pagina.replace("__NOMECLIENTE__", cliente.nome_empresa)

  
  const vendas = banco.prepare("SELECT * FROM vendas WHERE id_cliente = ?").all(id_cliente)
  let itens = ""
  for (let i = 0; i < vendas.length; i++) {
    let venda = vendas[i]
    itens = itens + "<tr>" +
  "<td>" + cliente.nome_empresa + "</td>" +
  "<td>R$" + venda.valor_venda + "</td>" +
  "<td>" + venda.comissao + "%</td>" +
  "<td>R$" + (venda.valor_venda * (venda.comissao/100)) + "</td>" +
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
})

app.get("/salvar_venda", (req, res) => {

  const id_cliente = req.query.id_cliente
  const valor_venda = req.query.valor_venda
  const descricao = req.query.descricao
  const comissao = req.query.comissao
  const data_venda = req.query.data_venda

  if (id_cliente && valor_venda && data_venda && descricao && comissao) {
    banco.prepare(`
      INSERT INTO vendas (id_cliente, valor_venda, descricao, comissao, data_venda)
      VALUES (?, ?, ?, ?, ?)
    `).run(id_cliente, valor_venda, descricao, comissao, data_venda)
  }


  res.redirect("/cliente?id_cliente="+id_cliente)
})

app.get("/excluir_venda", (req, res) => {
  const id_venda = req.query.id_venda
  const id_cliente = req.query.id_cliente
  if (id_venda) {
    banco.prepare("DELETE FROM vendas WHERE id_venda = ?").run(id_venda)
  }

  res.redirect('/cliente?id_cliente=' + id_cliente)
})

app.post('/upload_pdf', upload.single('pdf'), (req, res) => {
  const id_cliente = req.query.id_cliente

  banco.prepare(
    'INSERT INTO pdfs (id_cliente, nome, dados) VALUES (?, ?, ?)'
  ).run(id_cliente, req.file.originalname, req.file.buffer)

  res.redirect('/cliente?id_cliente=' + id_cliente)
})

app.get('/pdf/download', (req, res) => {
  const id_pdf = req.query.id_pdf
  const pdf = banco.prepare('SELECT nome, dados FROM pdfs WHERE id_pdf = ?').get(id_pdf)

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'attachment; filename=' + pdf.nome)
  res.send(pdf.dados)
})



app.get('/excluir_pdf', (req, res) => {
  const id_pdf = req.query.id_pdf
  if (id_pdf) {
    banco.prepare('DELETE FROM pdfs WHERE id_pdf = ?').run(id_pdf)
  }
  res.redirect('/cliente?id_cliente=' + req.query.id_cliente)
})

app.listen(3000, () => {
  console.log("Servidor rodando")
})